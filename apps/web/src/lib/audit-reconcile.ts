import { prisma } from "@/lib/prisma"
import {
  reconcileAuditEvents,
  type ReconcileSourceKey,
} from "@/lib/audit-events"
import { auditReconcileLagMs, auditReconcileFailuresTotal } from "@/lib/metrics"

interface CheckpointRow {
  source: string
  backfillCursor: string | null
  lastSuccessAt: Date | null
  lastError: string | null
}

interface CheckpointDelegate {
  upsert(args: unknown): Promise<CheckpointRow>
  update(args: unknown): Promise<CheckpointRow>
}

function getCheckpointDelegate(): CheckpointDelegate | undefined {
  const delegate = (prisma as unknown as { auditReconcileCheckpoint?: unknown }).auditReconcileCheckpoint
  if (!delegate || typeof delegate !== "object") return undefined
  const candidate = delegate as Partial<CheckpointDelegate>
  if (typeof candidate.upsert !== "function" || typeof candidate.update !== "function") return undefined
  return candidate as CheckpointDelegate
}

const SOURCES: ReconcileSourceKey[] = ["adminAuditLog", "aimExecutionTrace", "agentApiCallLog"]

export interface AuditReconcileBatchResult {
  scanned: number
  indexed: number
  skipped: number
  failures: number
  lagMs: number | null
  checkpoints: Array<{ source: string; nextCursor: string | null; lastSuccessAt: string | null; error: string | null }>
}

function checkpointCreate(source: ReconcileSourceKey) {
  return {
    where: { source },
    create: { source },
    update: {},
  }
}

/** Run one bounded page per specialist source and persist restartable cursors. */
export async function runAuditReconcileBatch(
  now = new Date(),
  limit = 100,
): Promise<AuditReconcileBatchResult> {
  const delegate = getCheckpointDelegate()
  if (!delegate) throw new Error("AuditReconcileCheckpoint client is not generated")

  let scanned = 0
  let indexed = 0
  let skipped = 0
  let failures = 0
  let lagMs: number | null = null
  const checkpoints: AuditReconcileBatchResult["checkpoints"] = []

  for (const source of SOURCES) {
    const checkpoint = await delegate.upsert(checkpointCreate(source))
    try {
      const result = await reconcileAuditEvents(limit, checkpoint.backfillCursor || undefined, source)
      scanned += result.scanned
      indexed += result.indexed
      skipped += result.skipped
      const updated = await delegate.update({
        where: { source },
        data: {
          backfillCursor: result.nextCursor,
          highWatermarkAt: now,
          highWatermarkId: now.toISOString(),
          lastSuccessAt: now,
          lastError: null,
          scanned: { increment: result.scanned },
          indexed: { increment: result.indexed },
        },
      })
      checkpoints.push({ source, nextCursor: result.nextCursor, lastSuccessAt: updated.lastSuccessAt?.toISOString() || null, error: null })
      auditReconcileLagMs.set(0)
    } catch (error) {
      failures += 1
      auditReconcileFailuresTotal.inc({ source })
      const message = error instanceof Error ? error.message.slice(0, 500) : "unknown reconcile error"
      const updated = await delegate.update({
        where: { source },
        data: { lastError: message },
      })
      const sourceLag = updated.lastSuccessAt ? Math.max(0, now.getTime() - updated.lastSuccessAt.getTime()) : null
      if (sourceLag !== null) lagMs = lagMs === null ? sourceLag : Math.max(lagMs, sourceLag)
      checkpoints.push({ source, nextCursor: updated.backfillCursor, lastSuccessAt: updated.lastSuccessAt?.toISOString() || null, error: message })
    }
  }
  if (lagMs !== null) auditReconcileLagMs.set(lagMs)
  return { scanned, indexed, skipped, failures, lagMs, checkpoints }
}

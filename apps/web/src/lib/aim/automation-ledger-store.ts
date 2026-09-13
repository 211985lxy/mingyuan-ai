import { prisma } from "@/lib/prisma"
import type {
  AutomationLedgerStore,
  LedgerAlertRecord,
  LedgerBackgroundTaskRecord,
  LedgerReconcileCheckpointRecord,
} from "@/lib/aim/automation-ledger"

type BackgroundTaskDelegate = {
  findMany(args: unknown): Promise<Array<{
    kind: string
    status: string
    completedAt: Date | null
    updatedAt: Date
    lastError: string | null
  }>>
}

type AlertDelegate = {
  findMany(args: unknown): Promise<Array<{
    source: string
    severity: string
    status: string
    summary: string
    lastSeenAt: Date
  }>>
}

type CheckpointDelegate = {
  findMany(args: unknown): Promise<Array<{
    source: string
    lastSuccessAt: Date | null
  }>>
}

function asAlertSeverity(value: string): LedgerAlertRecord["severity"] {
  if (value === "error" || value === "critical" || value === "warning") return value
  return "warning"
}

function asAlertStatus(value: string): LedgerAlertRecord["status"] {
  if (value === "acknowledged" || value === "resolved") return value
  return "open"
}

export function createPrismaAutomationLedgerStore(): AutomationLedgerStore {
  return {
    async listRecentBackgroundTasks(): Promise<LedgerBackgroundTaskRecord[]> {
      const delegate = (prisma as unknown as { backgroundTask?: BackgroundTaskDelegate }).backgroundTask
      if (!delegate) return []
      return delegate.findMany({
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: { kind: true, status: true, completedAt: true, updatedAt: true, lastError: true },
      })
    },
    async listRecentAlerts(): Promise<LedgerAlertRecord[]> {
      const delegate = (prisma as unknown as { operationalAlert?: AlertDelegate }).operationalAlert
      if (!delegate) return []
      const rows = await delegate.findMany({
        where: { status: { in: ["open", "acknowledged"] } },
        orderBy: { lastSeenAt: "desc" },
        take: 200,
        select: { source: true, severity: true, status: true, summary: true, lastSeenAt: true },
      })
      return rows.map((row) => ({
        source: row.source,
        severity: asAlertSeverity(row.severity),
        status: asAlertStatus(row.status),
        summary: row.summary,
        lastSeenAt: row.lastSeenAt,
      }))
    },
    async listReconcileCheckpoints(): Promise<LedgerReconcileCheckpointRecord[]> {
      const delegate = (prisma as unknown as { auditReconcileCheckpoint?: CheckpointDelegate }).auditReconcileCheckpoint
      if (!delegate) return []
      return delegate.findMany({
        select: { source: true, lastSuccessAt: true },
        take: 100,
      })
    },
  }
}

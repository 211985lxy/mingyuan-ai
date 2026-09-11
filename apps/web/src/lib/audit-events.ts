import type { Prisma } from "@/generated/prisma/client"
import { randomUUID } from "node:crypto"
import { Buffer } from "node:buffer"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { auditIdempotencyConflictsTotal, auditIndexFailuresTotal } from "@/lib/metrics"
import {
  buildAuditIdempotencyKey,
  normalizeAuditEvent,
  type AuditEventInput,
} from "@/lib/audit-event-contract"

export interface AuditWriteResult {
  ok: boolean
  id?: string
  inserted: boolean
  conflict?: boolean
}

type AuditEventDelegate = {
  upsert(args: Prisma.AuditEventUpsertArgs): Promise<{ id: string }>
  findUnique?: (args: Prisma.AuditEventFindUniqueArgs) => Promise<{ id: string; payloadHash: string } | null>
}

export class AuditIdempotencyConflictError extends Error {
  readonly code = "AUDIT_IDEMPOTENCY_CONFLICT"

  constructor(readonly source: string, readonly idempotencyKey: string, readonly existingId?: string) {
    super(`Audit idempotency key conflicts with an existing payload: ${source}:${idempotencyKey}`)
    this.name = "AuditIdempotencyConflictError"
  }
}

function getAuditEventDelegate(): AuditEventDelegate | undefined {
  return (prisma as typeof prisma & { auditEvent?: AuditEventDelegate }).auditEvent
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return value as Prisma.InputJsonValue
}

async function backfillLegacyPayloadHash(
  delegate: AuditEventDelegate,
  args: Prisma.AuditEventUpsertArgs,
): Promise<AuditWriteResult> {
  const row = await delegate.upsert(args)
  return { ok: true, id: row.id, inserted: false }
}

/**
 * Writes one normalized event to the cross-source audit index. The default is
 * best-effort so an audit-index outage cannot take down ordinary product work.
 * Callers that already have a mandatory specialist audit record should keep
 * enforcing that record separately before calling this helper.
 */
export async function recordAuditEvent(
  input: AuditEventInput,
  options: { strict?: boolean } = {},
): Promise<AuditWriteResult> {
  const delegate = getAuditEventDelegate()
  if (!delegate) {
    if (options.strict) throw new Error("AuditEvent client is not generated")
    return { ok: false, inserted: false }
  }

  try {
    const stableKey = input.idempotencyKey || (
      input.sourceRecordType && input.sourceRecordId
        ? buildAuditIdempotencyKey(input.source, input.sourceRecordType, input.sourceRecordId)
        : undefined
    )
    const event = normalizeAuditEvent({ ...input, idempotencyKey: stableKey })
    const idempotencyKey = event.idempotencyKey || (
      event.sourceRecordType && event.sourceRecordId
        ? buildAuditIdempotencyKey(event.source, event.sourceRecordType, event.sourceRecordId)
        : undefined
    ) || randomUUID()
    const data = {
      occurredAt: event.occurredAt,
      source: event.source,
      category: event.category,
      severity: event.severity,
      status: event.status,
      action: event.action,
      summary: event.summary,
      actorType: event.actorType,
      actorIdHash: event.actorIdHash,
      targetType: event.targetType,
      targetId: event.targetId,
      projectId: event.projectId,
      environment: event.environment,
      correlationId: event.correlationId,
      requestId: event.requestId,
      traceId: event.traceId,
      gitSha: event.gitSha,
      sourceRecordType: event.sourceRecordType,
      sourceRecordId: event.sourceRecordId,
      idempotencyKey,
      payloadHash: event.payloadHash,
      metadata: toJsonValue(event.metadata),
      externalLogUrl: event.externalLogUrl,
    }
    if (delegate.findUnique) {
      const existing = await delegate.findUnique({
        where: { source_idempotencyKey: { source: event.source, idempotencyKey } },
        select: { id: true, payloadHash: true },
      })
      if (existing) {
        if (existing.payloadHash === event.payloadHash) {
          return { ok: true, id: existing.id, inserted: false }
        }
        if (!existing.payloadHash) {
          return backfillLegacyPayloadHash(delegate, {
            where: { source_idempotencyKey: { source: event.source, idempotencyKey } },
            create: data,
            update: { payloadHash: event.payloadHash },
            select: { id: true },
          })
        }
        throw new AuditIdempotencyConflictError(event.source, idempotencyKey, existing.id)
      }
    }
    const row = await delegate.upsert({
      where: { source_idempotencyKey: { source: event.source, idempotencyKey } },
      create: data,
      update: {},
      select: { id: true },
    })
    return { ok: true, id: row.id, inserted: true }
  } catch (error) {
    if (error instanceof AuditIdempotencyConflictError) {
      auditIdempotencyConflictsTotal.inc({ source: error.source })
      if (options.strict) throw error
      logger.error({ source: error.source, idempotencyKey: error.idempotencyKey }, "audit idempotency conflict")
      return { ok: false, inserted: false, conflict: true }
    }
    auditIndexFailuresTotal.inc({ source: input.source })
    if (options.strict) throw error
    logger.error({ err: error, action: input.action, source: input.source }, "audit event write failed")
    return { ok: false, inserted: false }
  }
}

/** Writes the redacted index event that corresponds to an AgentApiCallLog row. */
export function recordAgentApiAudit(input: {
  recordId: string
  userId?: string | null
  projectId?: string | null
  agentId?: string | null
  action: string
  status: "success" | "failed"
  durationMs?: number | null
  correlationId?: string | null
  traceId?: string | null
}) {
  return recordAuditEvent(specialistAuditInput({
    source: "agent_api",
    category: "model_call",
    severity: input.status === "failed" ? "error" : "info",
    status: input.status,
    action: input.action,
    summary: input.status === "failed" ? "Agent API call failed" : "Agent API call completed",
    sourceRecordType: "AgentApiCallLog",
    sourceRecordId: input.recordId,
    actorType: "user",
    actorId: input.userId || undefined,
    targetType: input.agentId ? "agent" : "agent_api_call",
    targetId: input.agentId || input.recordId,
    projectId: input.projectId || undefined,
    correlationId: input.correlationId || input.recordId,
    traceId: input.traceId || undefined,
    metadata: { durationMs: input.durationMs ?? undefined, agentId: input.agentId || undefined },
  }))
}

export function specialistAuditInput(input: {
  source: AuditEventInput["source"]
  category: AuditEventInput["category"]
  severity?: AuditEventInput["severity"]
  status: AuditEventInput["status"]
  action: string
  summary: string
  sourceRecordType: string
  sourceRecordId: string
  idempotencyKey?: string
  occurredAt?: Date | string
  actorType?: string
  actorId?: string
  targetType?: string
  targetId?: string
  userId?: string
  projectId?: string
  correlationId?: string
  requestId?: string
  traceId?: string
  gitSha?: string
  metadata?: unknown
}): AuditEventInput {
  return {
    ...input,
    severity: input.severity || (input.status === "failed" ? "error" : "info"),
    idempotencyKey: input.idempotencyKey || buildAuditIdempotencyKey(input.source, input.sourceRecordType, input.sourceRecordId),
  }
}

type SpecialistRow = Record<string, unknown>
export type ReconcileSourceKey = "adminAuditLog" | "aimExecutionTrace" | "agentApiCallLog"

function getSpecialistDelegate(name: "adminAuditLog" | "aimExecutionTrace" | "agentApiCallLog") {
  const value = (prisma as unknown as Record<string, unknown>)[name]
  if (!value || typeof value !== "object" || typeof (value as { findMany?: unknown }).findMany !== "function") {
    return undefined
  }
  return value as { findMany(args: unknown): Promise<SpecialistRow[]> }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

type ReconcileMarker = { createdAt: string; id: string }
type ReconcileCursor = Partial<Record<ReconcileSourceKey, ReconcileMarker>>

function decodeReconcileCursor(value?: string): ReconcileCursor {
  if (!value) return {}
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("invalid cursor")
    const allowed = ["adminAuditLog", "aimExecutionTrace", "agentApiCallLog"] as const
    for (const key of allowed) {
      const marker = (decoded as Record<string, unknown>)[key]
      if (marker === undefined) continue
      if (!marker || typeof marker !== "object" || Array.isArray(marker)) throw new Error("invalid marker")
      const item = marker as Record<string, unknown>
      if (typeof item.id !== "string" || !item.id || typeof item.createdAt !== "string" || Number.isNaN(new Date(item.createdAt).getTime())) {
        throw new Error("invalid marker")
      }
    }
    return decoded as ReconcileCursor
  } catch {
    throw new Error("Invalid audit reconciliation cursor")
  }
}

function encodeReconcileCursor(value: ReconcileCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function reconcileStatus(value: unknown, source: "admin" | "aim" | "agent_api"): "started" | "success" | "failed" | undefined {
  const status = stringValue(value)
  if (!status && source === "admin") return "success" // legacy AdminAuditLog rows predate status.
  if (status === "running") return "started"
  if (status === "success") return "success"
  if (status === "failed") return "failed"
  return undefined
}

function reconcileSeverity(status: "started" | "success" | "failed"): "info" | "warning" | "error" {
  if (status === "failed") return "error"
  if (status === "started") return "warning"
  return "info"
}

/** Indexes a bounded page from the three existing specialist tables. */
export async function reconcileAuditEvents(
  limit = 100,
  cursorValue?: string,
  sourceFilter?: ReconcileSourceKey,
): Promise<{ scanned: number; indexed: number; skipped: number; nextCursor: string | null }> {
  const boundedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  const cursor = decodeReconcileCursor(cursorValue)
  const nextMarkers: ReconcileCursor = { ...cursor }
  let hasMore = false
  const sources = [
    {
      delegate: getSpecialistDelegate("adminAuditLog"),
      source: "admin" as const,
      key: "adminAuditLog" as const,
      category: "operation" as const,
      sourceRecordType: "AdminAuditLog",
      select: { id: true, adminId: true, action: true, targetType: true, targetId: true, requestId: true, correlationId: true, status: true, severity: true, createdAt: true, metadata: true },
    },
    {
      delegate: getSpecialistDelegate("aimExecutionTrace"),
      source: "aim" as const,
      key: "aimExecutionTrace" as const,
      category: "execution" as const,
      sourceRecordType: "AimExecutionTrace",
      select: { id: true, userId: true, projectId: true, agentId: true, action: true, status: true, runId: true, model: true, provider: true, durationMs: true, totalTokens: true, qualityStatus: true, createdAt: true },
    },
    {
      delegate: getSpecialistDelegate("agentApiCallLog"),
      source: "agent_api" as const,
      key: "agentApiCallLog" as const,
      category: "model_call" as const,
      sourceRecordType: "AgentApiCallLog",
      select: { id: true, userId: true, projectId: true, agentId: true, action: true, status: true, errorMessage: true, durationMs: true, createdAt: true },
    },
  ].filter((source) => !sourceFilter || source.key === sourceFilter)

  let scanned = 0
  let indexed = 0
  let skipped = 0
  for (const source of sources) {
    if (!source.delegate) continue
    const marker = cursor[source.key]
    const where = marker
      ? {
          OR: [
            { createdAt: { lt: new Date(marker.createdAt) } },
            { createdAt: new Date(marker.createdAt), id: { lt: marker.id } },
          ],
        }
      : undefined
    const rows = await source.delegate.findMany({ ...(where ? { where } : {}), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: boundedLimit, select: source.select })
    scanned += rows.length
    if (rows.length === boundedLimit) hasMore = true
    const last = rows[rows.length - 1]
    const lastId = stringValue(last?.id)
    const lastCreatedAt = last?.createdAt instanceof Date ? last.createdAt.toISOString() : stringValue(last?.createdAt)
    if (lastId && lastCreatedAt) {
      nextMarkers[source.key] = { id: lastId, createdAt: lastCreatedAt }
    }
    for (const row of rows) {
      const status = reconcileStatus(row.status, source.source)
      if (!status) {
        skipped += 1
        continue
      }
      const result = await recordAuditEvent(specialistAuditInput({
        source: source.source,
        category: source.category,
        severity: source.source === "admin" && stringValue(row.severity) === "critical"
          ? "critical"
          : reconcileSeverity(status),
        status,
        action: stringValue(row.action) || "unknown",
        summary: source.source === "admin"
          ? `${stringValue(row.action) || "admin operation"} ${stringValue(row.targetType) || "target"}`
          : `${source.sourceRecordType} ${stringValue(row.action) || "execution"}`,
        actorType: source.source === "admin" ? "admin" : source.source === "aim" ? "user" : "agent_api",
        actorId: stringValue(row.adminId) || stringValue(row.userId),
        targetType: stringValue(row.targetType),
        targetId: stringValue(row.targetId),
        projectId: stringValue(row.projectId),
        correlationId: stringValue(row.correlationId) || stringValue(row.runId) || stringValue(row.requestId) || String(row.id),
        requestId: stringValue(row.requestId),
        traceId: source.source === "aim" ? String(row.id) : undefined,
        sourceRecordType: source.sourceRecordType,
        sourceRecordId: String(row.id),
        idempotencyKey: source.source === "admin"
          ? undefined
          : `${source.source}:${source.sourceRecordType}:${String(row.id)}:${status}`,
        occurredAt: row.createdAt as Date | string | undefined,
        metadata: {
          agentId: stringValue(row.agentId),
          model: stringValue(row.model),
          provider: stringValue(row.provider),
          durationMs: typeof row.durationMs === "number" ? row.durationMs : undefined,
          totalTokens: typeof row.totalTokens === "number" ? row.totalTokens : undefined,
          qualityStatus: stringValue(row.qualityStatus),
        },
      }))
      if (result.ok) indexed += 1
      else if (result.conflict || !result.ok) skipped += 1
    }
  }
  return { scanned, indexed, skipped, nextCursor: hasMore ? encodeReconcileCursor(nextMarkers) : null }
}

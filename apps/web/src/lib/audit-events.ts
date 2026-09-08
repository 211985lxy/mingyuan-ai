import type { Prisma } from "@/generated/prisma/client"
import { randomUUID } from "node:crypto"
import { Buffer } from "node:buffer"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  buildAuditIdempotencyKey,
  normalizeAuditEvent,
  type AuditEventInput,
} from "@/lib/audit-event-contract"

export interface AuditWriteResult {
  ok: boolean
  id?: string
  inserted: boolean
}

type AuditEventDelegate = {
  upsert(args: Prisma.AuditEventUpsertArgs): Promise<{ id: string }>
}

function getAuditEventDelegate(): AuditEventDelegate | undefined {
  return (prisma as typeof prisma & { auditEvent?: AuditEventDelegate }).auditEvent
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return value as Prisma.InputJsonValue
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
    const event = normalizeAuditEvent(input)
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
      metadata: toJsonValue(event.metadata),
      externalLogUrl: event.externalLogUrl,
    }
    const row = await delegate.upsert({
      where: { source_idempotencyKey: { source: event.source, idempotencyKey } },
      create: data,
      update: {},
      select: { id: true },
    })
    return { ok: true, id: row.id, inserted: true }
  } catch (error) {
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
type ReconcileCursor = Partial<Record<"adminAuditLog" | "aimExecutionTrace" | "agentApiCallLog", ReconcileMarker>>

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

/** Indexes a bounded page from the three existing specialist tables. */
export async function reconcileAuditEvents(limit = 100, cursorValue?: string): Promise<{ scanned: number; indexed: number; nextCursor: string | null }> {
  const boundedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  const cursor = decodeReconcileCursor(cursorValue)
  const nextMarkers: ReconcileCursor = { ...cursor }
  let hasMore = false
  const sources = [
    {
      delegate: getSpecialistDelegate("adminAuditLog"),
      source: "admin" as const,
      category: "operation" as const,
      sourceRecordType: "AdminAuditLog",
      select: { id: true, adminId: true, action: true, targetType: true, targetId: true, requestId: true, createdAt: true, metadata: true },
    },
    {
      delegate: getSpecialistDelegate("aimExecutionTrace"),
      source: "aim" as const,
      category: "execution" as const,
      sourceRecordType: "AimExecutionTrace",
      select: { id: true, userId: true, projectId: true, agentId: true, action: true, status: true, runId: true, model: true, provider: true, durationMs: true, totalTokens: true, qualityStatus: true, createdAt: true },
    },
    {
      delegate: getSpecialistDelegate("agentApiCallLog"),
      source: "agent_api" as const,
      category: "model_call" as const,
      sourceRecordType: "AgentApiCallLog",
      select: { id: true, userId: true, projectId: true, agentId: true, action: true, status: true, errorMessage: true, durationMs: true, createdAt: true },
    },
  ]

  let scanned = 0
  let indexed = 0
  for (const source of sources) {
    if (!source.delegate) continue
    const marker = cursor[source.sourceRecordType === "AdminAuditLog" ? "adminAuditLog" : source.sourceRecordType === "AimExecutionTrace" ? "aimExecutionTrace" : "agentApiCallLog"]
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
      const key = source.sourceRecordType === "AdminAuditLog" ? "adminAuditLog" : source.sourceRecordType === "AimExecutionTrace" ? "aimExecutionTrace" : "agentApiCallLog"
      nextMarkers[key] = { id: lastId, createdAt: lastCreatedAt }
    }
    for (const row of rows) {
      const status = stringValue(row.status) === "failed" ? "failed" : "success"
      const result = await recordAuditEvent(specialistAuditInput({
        source: source.source,
        category: source.category,
        severity: status === "failed" ? "error" : "info",
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
        correlationId: stringValue(row.runId) || stringValue(row.requestId) || String(row.id),
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
          error: source.source === "agent_api" ? stringValue(row.errorMessage) : undefined,
        },
      }))
      if (result.ok) indexed += 1
    }
  }
  return { scanned, indexed, nextCursor: hasMore ? encodeReconcileCursor(nextMarkers) : null }
}

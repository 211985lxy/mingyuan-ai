import { parseShanghaiDateRange, type ShanghaiDateRange } from "@/lib/shanghai-time"

export interface AuditEventFilters {
  range: ShanghaiDateRange
  source?: string
  category?: string
  severity?: string
  status?: string
  projectId?: string
  correlationId?: string
  actorIdHash?: string
  action?: string
}

export interface ParsedAuditEventQuery {
  filters: AuditEventFilters
  where: Record<string, unknown>
  limit: number
  cursor: string | null
}

export const AUDIT_EVENT_SELECT = {
  id: true,
  occurredAt: true,
  ingestedAt: true,
  source: true,
  category: true,
  severity: true,
  status: true,
  action: true,
  summary: true,
  actorType: true,
  actorIdHash: true,
  targetType: true,
  targetId: true,
  projectId: true,
  environment: true,
  correlationId: true,
  requestId: true,
  traceId: true,
  gitSha: true,
  sourceRecordType: true,
  sourceRecordId: true,
  idempotencyKey: true,
  payloadHash: true,
  metadata: true,
  externalLogUrl: true,
} as const

function optionalParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim()
  return value ? value.slice(0, 191) : undefined
}

export function parseAuditEventQuery(params: URLSearchParams): ParsedAuditEventQuery | { error: string } {
  const legacyDate = params.get("date")?.trim()
  const rangeParams = new URLSearchParams()
  const from = params.get("from")?.trim() || legacyDate
  const to = params.get("to")?.trim() || legacyDate
  if (from) rangeParams.set("from", from)
  if (to) rangeParams.set("to", to)
  const range = parseShanghaiDateRange(rangeParams)
  if ("error" in range) return range

  const requestedLimit = Number(params.get("limit") || "50")
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
    : 50
  const filters: AuditEventFilters = {
    range,
    source: optionalParam(params, "source"),
    category: optionalParam(params, "category"),
    severity: optionalParam(params, "severity"),
    status: optionalParam(params, "status"),
    projectId: optionalParam(params, "projectId"),
    correlationId: optionalParam(params, "correlationId"),
    actorIdHash: optionalParam(params, "actorIdHash"),
    action: optionalParam(params, "action"),
  }
  return {
    filters,
    where: buildAuditEventWhere(filters),
    limit,
    cursor: params.get("cursor")?.trim() || null,
  }
}

export function buildAuditEventWhere(filters: AuditEventFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {
    occurredAt: { gte: filters.range.start, lt: filters.range.end },
  }
  for (const key of ["source", "category", "severity", "status", "projectId", "correlationId", "actorIdHash"] as const) {
    const value = filters[key]
    if (value) where[key] = value
  }
  if (filters.action) where.action = { contains: filters.action }
  return where
}

export function auditEventCursor(cursor: string | null): Record<string, unknown> | undefined {
  if (!cursor) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("cursor")
    const value = parsed as Record<string, unknown>
    if (typeof value.id !== "string" || !value.id) throw new Error("cursor")
    if (typeof value.occurredAt !== "string" || Number.isNaN(new Date(value.occurredAt).getTime())) throw new Error("cursor")
    return { occurredAt: new Date(value.occurredAt), id: value.id }
  } catch {
    // Keep old bookmarked cursors readable while new responses use the
    // timestamp+id tuple above.
    if (/^[A-Za-z0-9_.:-]{1,191}$/.test(cursor)) return { id: cursor }
    throw new Error("cursor 无效")
  }
}

export function encodeAuditEventCursor(value: { id: string; occurredAt: Date }): string {
  return Buffer.from(JSON.stringify({ id: value.id, occurredAt: value.occurredAt.toISOString() }), "utf8").toString("base64url")
}

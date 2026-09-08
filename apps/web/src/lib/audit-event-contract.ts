import { createHash, randomUUID } from "node:crypto"

export const AUDIT_SOURCES = [
  "user",
  "admin",
  "aim",
  "agent_api",
  "repo_agent",
  "server",
] as const

export const AUDIT_CATEGORIES = [
  "operation",
  "execution",
  "model_call",
  "repository_change",
  "deployment",
  "runtime",
] as const

export const AUDIT_SEVERITIES = ["info", "warning", "error", "critical"] as const
export const AUDIT_STATUSES = ["started", "success", "failed"] as const

export type AuditSource = (typeof AUDIT_SOURCES)[number]
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number]
export type AuditStatus = (typeof AUDIT_STATUSES)[number]

export interface AuditEventInput {
  source: AuditSource
  category: AuditCategory
  severity: AuditSeverity
  status: AuditStatus
  action: string
  summary: string
  actorType?: string
  actorId?: string
  actorIdHash?: string
  targetType?: string
  targetId?: string
  projectId?: string
  environment?: string
  correlationId?: string
  requestId?: string
  traceId?: string
  gitSha?: string
  sourceRecordType?: string
  sourceRecordId?: string
  idempotencyKey?: string
  metadata?: unknown
  externalLogUrl?: string
  occurredAt?: Date | string
}

export interface NormalizedAuditEvent extends Omit<AuditEventInput, "actorId" | "metadata" | "occurredAt"> {
  actorIdHash?: string
  metadata?: Record<string, unknown> | unknown[]
  occurredAt: Date
}

const SENSITIVE_KEY = /(?:token|secret|password|authorization|cookie|prompt|raw.?input|output.?summary|input.?summary|database.?url|api.?key|private.?key|email)/i
const MAX_SUMMARY_LENGTH = 5000
const MAX_METADATA_STRING_LENGTH = 2000
const MAX_METADATA_DEPTH = 6

function assertEnum<T extends string>(value: string, allowed: readonly T[], label: string): asserts value is T {
  if (!allowed.includes(value as T)) throw new Error(`Invalid audit event ${label}`)
}

function hashActorId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_METADATA_DEPTH) return "[truncated]"
  if (typeof value === "string") {
    return value.length > MAX_METADATA_STRING_LENGTH
      ? `${value.slice(0, MAX_METADATA_STRING_LENGTH - 3)}...`
      : value
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactAuditValue(item, depth + 1))
  if (!value || typeof value !== "object") return value

  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue
    result[key] = redactAuditValue(child, depth + 1)
  }
  return result
}

export function buildAuditIdempotencyKey(source: string, sourceRecordType: string, sourceRecordId: string): string {
  return `${source}:${sourceRecordType}:${sourceRecordId}`
}

export function normalizeAuditEvent(input: AuditEventInput): NormalizedAuditEvent {
  assertEnum(input.source, AUDIT_SOURCES, "source")
  assertEnum(input.category, AUDIT_CATEGORIES, "category")
  assertEnum(input.severity, AUDIT_SEVERITIES, "severity")
  assertEnum(input.status, AUDIT_STATUSES, "status")

  const action = input.action.trim()
  const summary = input.summary.trim()
  if (!action || action.length > 120) throw new Error("Audit action is invalid")
  if (summary.length > MAX_SUMMARY_LENGTH) throw new Error("Audit summary is too long")

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
  if (Number.isNaN(occurredAt.getTime())) throw new Error("Audit event occurredAt is invalid")

  const metadata = input.metadata === undefined ? undefined : redactAuditValue(input.metadata)
  return {
    ...input,
    action,
    summary,
    actorIdHash: input.actorIdHash || (input.actorId ? hashActorId(input.actorId) : undefined),
    correlationId: input.correlationId || randomUUID(),
    idempotencyKey: input.idempotencyKey || randomUUID(),
    metadata: metadata as Record<string, unknown> | unknown[] | undefined,
    occurredAt,
  }
}

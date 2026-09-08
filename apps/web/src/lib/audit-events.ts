import type { Prisma } from "@/generated/prisma/client"
import { randomUUID } from "node:crypto"
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

export function specialistAuditInput(input: {
  source: AuditEventInput["source"]
  category: AuditEventInput["category"]
  severity?: AuditEventInput["severity"]
  status: AuditEventInput["status"]
  action: string
  summary: string
  sourceRecordType: string
  sourceRecordId: string
  occurredAt?: Date | string
  actorType?: string
  actorId?: string
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
    idempotencyKey: buildAuditIdempotencyKey(input.source, input.sourceRecordType, input.sourceRecordId),
  }
}

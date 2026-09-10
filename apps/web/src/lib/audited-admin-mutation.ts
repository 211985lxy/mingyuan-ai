import type { NextRequest } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { generateRequestId } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { recordAuditEvent, specialistAuditInput } from "@/lib/audit-events"

export interface AuditedAdminMutationInput<T> {
  request: NextRequest
  adminId: string
  action: string
  targetType: string
  targetId?: string
  metadata?: Prisma.InputJsonValue
  mutate: (
    tx: Prisma.TransactionClient,
    context: { requestId: string; correlationId: string },
  ) => Promise<T>
}

export interface AuditedAdminMutationResult<T> {
  result: T
  requestId: string
  correlationId: string
  auditId: string
}

function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "UNKNOWN_ERROR"
  const name = (error as { name?: unknown }).name
  return typeof name === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(name) ? name : "UNKNOWN_ERROR"
}

function indexAdminAudit(input: {
  status: "success" | "failed"
  action: string
  targetType: string
  targetId?: string
  adminId: string
  requestId: string
  correlationId: string
  sourceRecordId: string
  metadata?: unknown
}) {
  void recordAuditEvent(specialistAuditInput({
    source: "admin",
    category: "operation",
    status: input.status,
    severity: input.status === "failed" ? "error" : "info",
    action: input.action,
    summary: input.status === "failed" ? `${input.action} failed` : `${input.action} ${input.targetType}`,
    actorType: "admin",
    actorId: input.adminId,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId,
    correlationId: input.correlationId,
    sourceRecordType: "AdminAuditLog",
    sourceRecordId: input.sourceRecordId,
    metadata: input.metadata,
  }))
}

async function writeFailedAudit(input: {
  adminId: string
  action: string
  targetType: string
  targetId?: string
  requestId: string
  correlationId: string
  error: unknown
}) {
  const metadata = { errorCode: safeErrorCode(input.error) }
  const failed = await prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      requestId: input.requestId,
      correlationId: input.correlationId,
      status: "failed",
      severity: "error",
      metadata,
    },
    select: { id: true },
  })
  indexAdminAudit({ ...input, status: "failed", sourceRecordId: failed.id, metadata })
}

/**
 * Runs a control-plane mutation and its specialist audit row in one
 * transaction. The normalized cross-source index is written only after the
 * transaction commits, so a rolled-back mutation cannot leave a success event.
 */
export async function runAuditedAdminMutation<T>(
  input: AuditedAdminMutationInput<T>,
): Promise<AuditedAdminMutationResult<T>> {
  const requestId = input.request.headers.get("x-request-id") || generateRequestId()
  const correlationId = input.request.headers.get("x-correlation-id") || requestId
  let sourceRecord: { id: string } | undefined

  try {
    const result = await prisma.$transaction(async (tx) => {
      const value = await input.mutate(tx, { requestId, correlationId })
      const audit = await tx.adminAuditLog.create({
        data: {
          adminId: input.adminId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          requestId,
          correlationId,
          status: "success",
          severity: "info",
          metadata: input.metadata,
        },
        select: { id: true },
      })
      sourceRecord = audit
      return value
    })

    if (!sourceRecord) throw new Error("Admin audit row was not created")
    indexAdminAudit({ ...input, status: "success", requestId, correlationId, sourceRecordId: sourceRecord.id })
    return { result, requestId, correlationId, auditId: sourceRecord.id }
  } catch (error) {
    // The business transaction is already rolled back. Keep a separate failed
    // source row so an attempted high-impact action remains accountable.
    try {
      await writeFailedAudit({ ...input, requestId, correlationId, error })
    } catch {
      // The original mutation error is more important than a secondary audit
      // storage failure; reconciliation can only recover committed source rows.
    }
    throw error
  }
}

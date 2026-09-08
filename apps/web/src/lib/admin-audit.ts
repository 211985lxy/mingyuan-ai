import type { NextRequest } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { generateRequestId } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { recordAuditEvent, specialistAuditInput } from "@/lib/audit-events"

/**
 * @description recordadminaudit
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function recordAdminAudit(input: {
  request: NextRequest
  adminId: string
  action: string
  targetType: string
  targetId?: string
  metadata?: Prisma.InputJsonValue
}) {
  const requestId = input.request.headers.get("x-request-id") || generateRequestId()
  const audit = await prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      requestId,
      metadata: input.metadata,
    },
  })
  void recordAuditEvent(specialistAuditInput({
    source: "admin",
    category: "operation",
    status: "success",
    action: input.action,
    summary: `${input.action} ${input.targetType}`,
    actorType: "admin",
    actorId: input.adminId,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId,
    correlationId: requestId,
    sourceRecordType: "AdminAuditLog",
    sourceRecordId: audit.id,
    metadata: input.metadata,
  }))
  return requestId
}

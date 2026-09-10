import type { NextRequest } from "next/server"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { generateRequestId } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { recordAuditEvent, specialistAuditInput } from "@/lib/audit-events"

const auditedRequests = new WeakSet<object>()

export function wasRequestAudited(request: object): boolean {
  return auditedRequests.has(request)
}

function markRequestAudited(request: object) {
  auditedRequests.add(request)
}

/**
 * @description recordadminaudit
 * @param input - 输入数据
 * @param client - 可选的事务/连接客户端。缺省用全局 prisma。审计必须与被审计的
 *   状态变更在同一 `$transaction` 内写入时，传入该事务客户端，保证“变更已提交但审计
 *   缺失”不会发生（审计失败 → 整个事务回滚）。
 * @returns 无返回值
 */
export async function recordAdminAudit(
  input: {
    request: NextRequest
    adminId: string
    action: string
    targetType: string
    targetId?: string
    status?: "started" | "success" | "failed"
    severity?: "info" | "warning" | "error" | "critical"
    correlationId?: string
    metadata?: Prisma.InputJsonValue
  },
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  const requestId = input.request.headers.get("x-request-id") || generateRequestId()
  const correlationId = input.correlationId || input.request.headers.get("x-correlation-id") || requestId
  const status = input.status || "success"
  const severity = input.severity || (status === "failed" ? "error" : "info")
  const audit = await client.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      requestId,
      correlationId,
      status,
      severity,
      metadata: input.metadata,
    },
  })
  markRequestAudited(input.request)
  void recordAuditEvent(specialistAuditInput({
    source: "admin",
    category: "operation",
    status,
    severity,
    action: input.action,
    summary: status === "failed" ? `${input.action} failed` : `${input.action} ${input.targetType}`,
    actorType: "admin",
    actorId: input.adminId,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId,
    correlationId,
    sourceRecordType: "AdminAuditLog",
    sourceRecordId: audit.id,
    metadata: input.metadata,
  }))
  return requestId
}

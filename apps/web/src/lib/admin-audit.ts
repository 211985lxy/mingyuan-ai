import type { NextRequest } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { generateRequestId } from "@/lib/logger"
import { prisma } from "@/lib/prisma"

export async function recordAdminAudit(input: {
  request: NextRequest
  adminId: string
  action: string
  targetType: string
  targetId?: string
  metadata?: Prisma.InputJsonValue
}) {
  const requestId = input.request.headers.get("x-request-id") || generateRequestId()
  await prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      requestId,
      metadata: input.metadata,
    },
  })
  return requestId
}

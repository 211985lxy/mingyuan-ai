import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import { agentAuthErrorResponse, authenticateAgentRequest } from "@/lib/agent-api-auth"
import { acknowledgeOutboxReply } from "@/features/topics/services/reply-outbox"

const bodySchema = z.object({
  claimToken: z.string().uuid(),
  sent: z.boolean(),
  errorMessage: z.string().trim().max(1000).optional(),
}).strict()

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateAgentRequest(request)
    const body = await parseJsonBody(request, bodySchema, { maxBytes: 4 * 1024 })
    const { id } = await params
    const acknowledged = await acknowledgeOutboxReply({
      userId: context.userId,
      allowedProjects: context.allowedProjects,
      replyId: id,
      claimToken: body.claimToken,
      sent: body.sent,
      errorMessage: body.errorMessage,
    })
    if (!acknowledged) return NextResponse.json({ error: "REPLY_CLAIM_NOT_FOUND" }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return agentAuthErrorResponse(error) ?? NextResponse.json({ error: "Reply acknowledgment failed" }, { status: 500 })
  }
}

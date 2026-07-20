import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import { agentAuthErrorResponse, authenticateAgentRequest } from "@/lib/agent-api-auth"
import { claimOutboxReplies } from "@/features/topics/services/reply-outbox"

const bodySchema = z.object({
  platform: z.enum(["workbuddy_wechat", "wecom"]),
  limit: z.number().int().min(1).max(10).optional(),
}).strict()

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const context = await authenticateAgentRequest(request)
    const body = await parseJsonBody(request, bodySchema, { maxBytes: 4 * 1024 })
    const items = await claimOutboxReplies({
      userId: context.userId,
      allowedProjects: context.allowedProjects,
      platform: body.platform,
      limit: body.limit,
    })
    // Return format is compatible with the legacy claim endpoint
    return NextResponse.json({ items })
  } catch (error) {
    return agentAuthErrorResponse(error) ?? NextResponse.json({ error: "Reply outbox claim failed" }, { status: 500 })
  }
}

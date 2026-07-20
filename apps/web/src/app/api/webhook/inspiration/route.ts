import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { env } from "@/env"
import { NextRequest, NextResponse } from "next/server"
import { inspirationWebhookBodySchema } from "@/features/knowledge/contracts/api"
import { ingestInspirationEvent } from "@/features/topics/services/inspiration-events"

/**
 * Webhook 入口：接收来自飞书/微信等外部服务的灵感推送
 *
 * 认证方式：Header x-inspiration-token
 * 配置：INSPIRATION_WEBHOOK_TOKEN 环境变量（必填，不再有默认 fallback）
 */

export const runtime = "nodejs"
export const maxDuration = 90

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  const webhookToken = env.INSPIRATION_WEBHOOK_TOKEN
  if (!webhookToken) {
    // 未配置时拒绝服务并明确报错,而不是用公开默认值放行
    console.error("[webhook/inspiration] INSPIRATION_WEBHOOK_TOKEN 未配置,拒绝请求")
    return NextResponse.json(
      { error: "Webhook 未配置鉴权令牌" },
      { status: 503 }
    )
  }
  const authHeader = request.headers.get("x-inspiration-token")
  if (!authHeader || authHeader !== webhookToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await parseJsonBody(request, inspirationWebhookBodySchema, { maxBytes: 16 * 1024 })
    const content = body.content
    const source = body.source || "text"
    const userId = env.INSPIRATION_WEBHOOK_USER_ID
    const projectId = env.INSPIRATION_WEBHOOK_PROJECT_ID
    if (!userId || !projectId) {
      return NextResponse.json({ error: "Webhook 绑定用户或项目未配置" }, { status: 503 })
    }

    const ingested = await ingestInspirationEvent({
      platform: "webhook",
      externalChatId: `legacy-${source}`,
      externalSenderId: source,
      projectId,
      content,
    }, userId)

    return NextResponse.json({
      ok: true,
      id: ingested.id,
      status: ingested.status,
      duplicate: ingested.duplicate,
      statusUrl: ingested.statusUrl,
      message: "灵感已保存，AI 将在后台生成正式选题",
    }, { status: 202 })
  } catch (error) {
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse
    if (error instanceof Error && /视频|链接|协议|公网|分享页|作品页/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[webhook/inspiration] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

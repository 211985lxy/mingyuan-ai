import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { env } from "@/env"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { inspirationWebhookBodySchema } from "@/features/knowledge/contracts/api"

/**
 * Webhook 入口：接收来自飞书/微信等外部服务的灵感推送
 *
 * 认证方式：Header x-inspiration-token
 * 配置：INSPIRATION_WEBHOOK_TOKEN 环境变量（必填，不再有默认 fallback）
 */

export const runtime = "nodejs"
export const maxDuration = 30

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
    if (!userId) {
      return NextResponse.json({ error: "Webhook 绑定用户未配置" }, { status: 503 })
    }
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!exists) {
      return NextResponse.json({ error: "Webhook 绑定用户不存在" }, { status: 503 })
    }

    // 创建灵感记录（自动触发 AI 处理）
    const inspiration = await prisma.inspiration.create({
      data: {
        userId,
        source,
        content,
        aiStatus: "pending",
      },
    })

    // 异步触发 AI 分析(带超时,防止 hang 住 fetch 连接)
    fetch(`${env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/inspiration/${inspiration.id}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("authorization")
          ? { Authorization: request.headers.get("authorization")! }
          : {}),
      },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      // 异步触发失败不影响 webhook 响应
      console.warn(`[webhook/inspiration] Failed to trigger AI process for ${inspiration.id}`)
    })

    return NextResponse.json({
      ok: true,
      id: inspiration.id,
      message: "灵感已保存，AI 分析中",
    })
  } catch (error) {
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse
    console.error("[webhook/inspiration] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Webhook 入口：接收来自飞书/微信等外部服务的灵感推送
 *
 * 认证方式：Header x-inspiration-token
 * 配置：INSPIRATION_WEBHOOK_TOKEN 环境变量（必填，不再有默认 fallback）
 */

interface WebhookPayload {
  content: string
  source?: string // feishu | wechat | text
  userId?: string // 可选，不传则关联系统首个用户
}

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const webhookToken = process.env.INSPIRATION_WEBHOOK_TOKEN
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
    const body: WebhookPayload = await request.json()
    const content = typeof body.content === "string" ? body.content.trim() : ""
    const source = body.source === "feishu" || body.source === "wechat" ? body.source : "text"

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 })
    }
    if (content.length > 10000) {
      return NextResponse.json({ error: "content too long (max 10000 chars)" }, { status: 400 })
    }

    // 找到要绑定的用户
    let userId = body.userId
    if (!userId) {
      const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
      if (!firstUser) {
        return NextResponse.json({ error: "No user found" }, { status: 404 })
      }
      userId = firstUser.id
    } else {
      const exists = await prisma.user.findUnique({ where: { id: userId } })
      if (!exists) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
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
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/inspiration/${inspiration.id}/process`, {
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
    console.error("[webhook/inspiration] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

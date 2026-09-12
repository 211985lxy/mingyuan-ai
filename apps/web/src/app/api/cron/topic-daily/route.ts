import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { env } from "@/env"
import { prisma } from "@/lib/prisma"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import { generateAndPushDailyTopics } from "@/features/topics/services/daily-topic-push"
import {
  sendInspirationDigestToFeishu,
  type InspirationDigestEntry,
} from "@/lib/aim/feishu-inspiration-digest-notify"

export const runtime = "nodejs"
export const maxDuration = 60

const DIGEST_WINDOW_HOURS = 24

/** 查最近 24h 的灵感记录作回顾素材；失败降级为空（回顾不推，不影响主流程）。 */
async function loadRecentInspirations(userId: string): Promise<InspirationDigestEntry[]> {
  try {
    const since = new Date(Date.now() - DIGEST_WINDOW_HOURS * 60 * 60 * 1000)
    const rows = await prisma.inspiration.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        content: true,
        sourceUrl: true,
        processingStage: true,
        aiStatus: true,
        createdAt: true,
      },
    })
    return rows
  } catch (error) {
    console.warn("[cron/topic-daily] 灵感回顾查询失败（跳过回顾）:", error)
    return []
  }
}

/**
 * @description 每日选题推送：生成当日选题并把人工裁决卡推送到飞书，随后附灵感回顾
 *  - 人在卡片上决定「采用 / 换一批 / 都不行」，决策回调 /api/integrations/feishu/topic-card-actions
 *  - 推送对象取 AIM_HOT_BRIEFING_USER_ID（与热点简报同一运营者），项目取其绑定项目
 *  - 灵感回顾：近 24h 用户在群里发的链接与想法，确认"系统记住了什么"；失败不阻断主流程
 * @param request - 请求对象
 * @returns 生成与推送结果
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = env.AIM_HOT_BRIEFING_USER_ID?.trim()
  if (!userId) {
    return NextResponse.json(
      { error: "未配置 AIM_HOT_BRIEFING_USER_ID，无法确定每日选题的推送对象" },
      { status: 400 },
    )
  }

  const requestId = `topic-daily-${Date.now()}`
  try {
    const project = await resolveBoundProject({ userId })
    const result = await generateAndPushDailyTopics({ userId, projectId: project.id, requestId })
    if (!result.ok) {
      console.error(`[${requestId}] 每日选题生成失败:`, result.error)
      return NextResponse.json({ error: result.error }, { status: 502 })
    }
    console.log(`[${requestId}] 选题 ${result.selectionId} pushed=${result.pushed}`)

    // 灵感回顾为附加能力：失败或为空都不影响选题卡
    let digest: { sent: boolean; reason?: string } = { sent: false, reason: "未执行" }
    try {
      digest = await sendInspirationDigestToFeishu(await loadRecentInspirations(userId))
    } catch (digestError) {
      console.error(`[${requestId}] 灵感回顾推送异常:`, digestError)
      digest = { sent: false, reason: digestError instanceof Error ? digestError.message : "回顾推送异常" }
    }

    return NextResponse.json({ data: { ...result, digest } })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error(`[${requestId}] 每日选题推送异常:`, error)
    return NextResponse.json({ error: "每日选题推送失败" }, { status: 500 })
  }
}

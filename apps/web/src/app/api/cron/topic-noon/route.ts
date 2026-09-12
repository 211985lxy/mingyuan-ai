import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { env } from "@/env"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import { loadDailyTopicSnapshot } from "@/lib/aim/daily-topic-snapshot"
import { loadNoonHotItems, sendNoonReportToFeishu } from "@/lib/aim/feishu-topic-noon-report"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * @description 午间速览：检查选题进度、提示下午安排与可借势热点
 *  - 与早报（cron/topic-daily）、晚报（cron/topic-evening）配对
 *  - 推送对象取 AIM_HOT_BRIEFING_USER_ID（与早晚报同一运营者）
 * @param request - 请求对象
 * @returns 推送结果
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = env.AIM_HOT_BRIEFING_USER_ID?.trim()
  if (!userId) {
    return NextResponse.json(
      { error: "未配置 AIM_HOT_BRIEFING_USER_ID，无法确定午报推送对象" },
      { status: 400 },
    )
  }

  const requestId = `topic-noon-${Date.now()}`
  try {
    const project = await resolveBoundProject({ userId })
    const [snapshot, hotItems] = await Promise.all([loadDailyTopicSnapshot(userId), loadNoonHotItems()])
    const result = await sendNoonReportToFeishu({ snapshot, hotItems }, project.name ?? null)
    console.log(`[${requestId}] 午报 pushed=${result.sent}${result.reason ? ` (${result.reason})` : ""}`)
    return NextResponse.json({
      data: {
        ...result,
        selections: snapshot.selections.length,
        inspirations: snapshot.inspirationCount,
        hotItems: hotItems.length,
      },
    })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error(`[${requestId}] 午报异常:`, error)
    return NextResponse.json({ error: "午报推送失败" }, { status: 500 })
  }
}

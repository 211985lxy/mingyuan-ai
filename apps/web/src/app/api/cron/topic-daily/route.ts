import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { env } from "@/env"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import { generateAndPushDailyTopics } from "@/features/topics/services/daily-topic-push"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * @description 每日选题推送：生成当日选题并把人工裁决卡推送到飞书
 *  - 人在卡片上决定「采用 / 换一批 / 都不行」，决策回调 /api/integrations/feishu/topic-card-actions
 *  - 推送对象取 AIM_HOT_BRIEFING_USER_ID（与热点简报同一运营者），项目取其绑定项目
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
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error(`[${requestId}] 每日选题推送异常:`, error)
    return NextResponse.json({ error: "每日选题推送失败" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { env } from "@/env"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import {
  loadEveningReportData,
  sendEveningReportToFeishu,
} from "@/lib/aim/feishu-topic-evening-report"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * @description 选题晚报：每天晚上汇报今日选题裁决、灵感收集与数据采集健康度
 *  - 纯读取汇报，零 LLM 成本；与早报（cron/topic-daily）配对
 *  - 推送对象取 AIM_HOT_BRIEFING_USER_ID（与早报同一运营者）
 * @param request - 请求对象
 * @returns 汇报推送结果
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = env.AIM_HOT_BRIEFING_USER_ID?.trim()
  if (!userId) {
    return NextResponse.json(
      { error: "未配置 AIM_HOT_BRIEFING_USER_ID，无法确定晚报推送对象" },
      { status: 400 },
    )
  }

  const requestId = `topic-evening-${Date.now()}`
  try {
    const project = await resolveBoundProject({ userId })
    const data = await loadEveningReportData(userId)
    const result = await sendEveningReportToFeishu(data, project.name ?? null)
    console.log(`[${requestId}] 晚报 pushed=${result.sent}${result.reason ? ` (${result.reason})` : ""}`)
    return NextResponse.json({ data: { ...result, selections: data.selections.length, inspirations: data.inspirationCount } })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error(`[${requestId}] 选题晚报异常:`, error)
    return NextResponse.json({ error: "选题晚报推送失败" }, { status: 500 })
  }
}

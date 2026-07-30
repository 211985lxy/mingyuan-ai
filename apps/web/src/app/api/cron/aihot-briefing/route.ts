import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { generateAndStoreAiHotBriefing } from "@/lib/aihot-briefing"
import { env } from "@/env"
import { buildWatchAccountDigest } from "@/lib/hot-briefing-watch-context"
import { sendHotBriefingToFeishu } from "@/lib/aim/feishu-hot-briefing-notify"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * @description 每日 AI HOT 简报生成 + 飞书推送
 *  - 生成 aihot 简报并入库（核心，不可被推送失败阻断）
 *  - 拼接对标账号动态（DB 快照）
 *  - 以选题策划官身份推送 markdown 卡片到飞书群（可选，失败只记日志）
 * @param request - 请求对象
 * @returns 生成结果 + 推送结果
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const briefing = await generateAndStoreAiHotBriefing()

    // 推送为附加能力：失败不阻断简报入库
    let push: { sent: boolean; reason?: string } = { sent: false }
    try {
      const watchDigest = await buildWatchAccountDigest(env.AIM_HOT_BRIEFING_USER_ID)
      const markdown = [briefing.markdown, "", "---", "", watchDigest].join("\n")
      push = await sendHotBriefingToFeishu({ markdown, title: briefing.title })
    } catch (pushError) {
      console.error("[cron/aihot-briefing] push failed (briefing saved):", pushError)
      push = { sent: false, reason: pushError instanceof Error ? pushError.message : "推送异常" }
    }

    return NextResponse.json({ data: briefing, push })
  } catch (error) {
    console.error("[cron/aihot-briefing] failed:", error)
    return NextResponse.json(
      { error: "AI HOT 简报生成失败" },
      { status: 502 },
    )
  }
}

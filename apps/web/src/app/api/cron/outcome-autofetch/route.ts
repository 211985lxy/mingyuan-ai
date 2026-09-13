import { NextRequest, NextResponse } from "next/server"

import { validateCronSecret } from "@/lib/admin-auth"
import { runPrismaOutcomeAutofetch } from "@/lib/aim/outcome-autofetch-store"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * 效果数据自动回流：每日拉取已绑定抖音号的作品列表，按 aweme_id 写入 ContentOutcome 内容信号。
 * 回滚：停掉对应 systemd timer 即可；只增不删。
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await runPrismaOutcomeAutofetch()
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error("[cron/outcome-autofetch] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "效果数据自动回流执行失败" }, { status: 503 })
  }
}

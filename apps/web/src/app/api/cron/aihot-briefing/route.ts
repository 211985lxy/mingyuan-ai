import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { generateAndStoreAiHotBriefing } from "@/lib/aihot-briefing"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const briefing = await generateAndStoreAiHotBriefing()
    return NextResponse.json({ data: briefing })
  } catch (error) {
    console.error("[cron/aihot-briefing] failed:", error)
    return NextResponse.json(
      { error: "AI HOT 简报生成失败" },
      { status: 502 }
    )
  }
}

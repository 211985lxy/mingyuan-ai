import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { fetchAndStore } from "@/lib/douyin-hot"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await fetchAndStore()
    return NextResponse.json({ data: result })
  } catch (error) {
    console.error("[cron/douyin-hot] failed:", error)
    return NextResponse.json({ error: "抖音热点抓取失败" }, { status: 502 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { refreshMarketHotSnapshot } from "@/lib/market-insights/market-hotlist"

export const runtime = "nodejs"
export const maxDuration = 180

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const snapshot = await refreshMarketHotSnapshot()
    return NextResponse.json({ data: snapshot })
  } catch (error) {
    console.error("[cron/market-hotlist] failed:", error)
    return NextResponse.json({ error: "近30天热榜生成失败" }, { status: 502 })
  }
}

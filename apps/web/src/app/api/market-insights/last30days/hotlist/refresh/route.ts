import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { refreshMarketHotSnapshot } from "@/lib/market-insights/market-hotlist"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request)
    const snapshot = await refreshMarketHotSnapshot()
    return NextResponse.json({ data: snapshot })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error("[market-hotlist/refresh] failed:", error)
    return NextResponse.json({ error: "近30天热榜刷新失败，请稍后重试" }, { status: 502 })
  }
}

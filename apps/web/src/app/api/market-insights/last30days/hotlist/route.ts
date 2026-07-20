import { NextResponse } from "next/server"
import { getLatestMarketHotSnapshot } from "@/lib/market-insights/market-hotlist"

/**
 * @description 处理 GET 请求
 * @returns 无返回值
 */
export async function GET() {
  try {
    const snapshot = await getLatestMarketHotSnapshot()
    return NextResponse.json({ data: snapshot })
  } catch (error) {
    console.error("[market-hotlist] failed:", error)
    return NextResponse.json({ error: "近30天热榜暂时不可用" }, { status: 502 })
  }
}

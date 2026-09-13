import { NextRequest, NextResponse } from "next/server"
import { authorizeCronJob } from "@/lib/aim/cron-job-guard"
import { refreshMarketHotSnapshot } from "@/lib/market-insights/market-hotlist"

export const runtime = "nodejs"
export const maxDuration = 180

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  const denied = await authorizeCronJob(request, "market-hotlist")
  if (denied) return denied

  try {
    const snapshot = await refreshMarketHotSnapshot()
    return NextResponse.json({ data: snapshot })
  } catch (error) {
    console.error("[cron/market-hotlist] failed:", error)
    return NextResponse.json({ error: "近30天热榜生成失败" }, { status: 502 })
  }
}

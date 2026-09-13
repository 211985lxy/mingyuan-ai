import { NextRequest, NextResponse } from "next/server"
import { authorizeCronJob } from "@/lib/aim/cron-job-guard"
import { fetchAndStore } from "@/lib/douyin-hot"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  const denied = await authorizeCronJob(request, "douyin-hot")
  if (denied) return denied

  try {
    const result = await fetchAndStore()
    return NextResponse.json({ data: result })
  } catch (error) {
    console.error("[cron/douyin-hot] failed:", error)
    return NextResponse.json({ error: "抖音热点抓取失败" }, { status: 502 })
  }
}

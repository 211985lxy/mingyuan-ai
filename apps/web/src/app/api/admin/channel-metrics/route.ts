import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { getChannelMetrics } from "@/lib/channel-metrics"

/**
 * @description 处理 GET 请求 — admin-only channel metrics
 */
export const GET = withAdminAuth(async (request: NextRequest) => {
  const url = new URL(request.url)
  const platform = url.searchParams.get("platform") || undefined
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const summary = await getChannelMetrics({ platform, since })

  return NextResponse.json(summary)
})

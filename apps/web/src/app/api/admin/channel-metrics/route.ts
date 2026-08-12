import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { getChannelMetrics } from "@/lib/channel-metrics"

/**
 * @description 处理 GET 请求 — admin-only channel metrics
 * 查询参数：platform（默认不限；飞书主战役传 feishu）、days（1–90，默认 7）
 * 响应含 Redis 渠道计数 + Inspiration 表只读 shadowSamples（不含客户原文）
 */
export const GET = withAdminOnly(async (request: NextRequest) => {
  const url = new URL(request.url)
  const platform = url.searchParams.get("platform") || undefined
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const summary = await getChannelMetrics({ platform, since })

  return NextResponse.json(summary)
})

import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { getChannelMetrics } from "@/lib/channel-metrics"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    // Channel metrics is an admin-only endpoint
    // TODO: add admin role check when RBAC is implemented
    void user

    const url = new URL(request.url)
    const platform = url.searchParams.get("platform") || undefined
    const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10)))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const summary = await getChannelMetrics({ platform, since })

    return NextResponse.json(summary)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "指标读取失败" }, { status: 500 })
  }
}

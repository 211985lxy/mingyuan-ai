import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { fetchCreatorMetrics } from "@/lib/aim/creator-metrics"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DAY_MS = 24 * 3600 * 1000

function parseDateParam(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 创作者平台表现（飞书数据总线，上游 data-scientist-community 同步）。
 * 查询参数 start/end（ISO 日期，end 不含）；缺省为最近 7 天。
 * 未配置返回 not_configured（200），由前端展示配置引导，不报错。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const params = request.nextUrl.searchParams
    const projectId = params.get("projectId")?.trim() || undefined
    if (projectId) {
      if (projectId.length > 80) return NextResponse.json({ error: "项目标识过长" }, { status: 400 })
      const project = await prisma.clientProject.findFirst({
        where: { id: projectId, userId: user.id, status: "active" },
        select: { id: true },
      })
      if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 })
    }

    const end = parseDateParam(params.get("end")) ?? new Date()
    const start = parseDateParam(params.get("start")) ?? new Date(end.getTime() - 7 * DAY_MS)
    if (params.get("start") && !parseDateParam(params.get("start"))) {
      return NextResponse.json({ error: "start 日期不合法" }, { status: 400 })
    }
    if (params.get("end") && !parseDateParam(params.get("end"))) {
      return NextResponse.json({ error: "end 日期不合法" }, { status: 400 })
    }
    if (start.getTime() >= end.getTime()) {
      return NextResponse.json({ error: "start 必须早于 end" }, { status: 400 })
    }

    const platformMetrics = await fetchCreatorMetrics({ start, end })
    return NextResponse.json(platformMetrics as unknown)
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}

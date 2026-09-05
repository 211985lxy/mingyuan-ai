import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { computeMonthlyOperatingReport, parseMonthString } from "@/lib/aim/monthly-report"
import { renderMonthlyReportHtml } from "@/lib/aim/monthly-report-html"

export const dynamic = "force-dynamic"

function currentMonth(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * @description 月度经营报告（WP-E · 客户一页式「内容→线索→成交」视图）
 * @param request - 查询参数 month=YYYY-MM、projectId 可选、format=json|html
 * @returns 默认 text/html；format=json 返回聚合 JSON
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)

    const url = new URL(request.url)
    const monthParam = url.searchParams.get("month")?.trim() || currentMonth()
    if (!parseMonthString(monthParam)) {
      return NextResponse.json({ error: "month 格式应为 YYYY-MM" }, { status: 400 })
    }
    const projectId = url.searchParams.get("projectId")?.trim() || null

    let projectName: string | null = null
    if (projectId) {
      const project = await prisma.clientProject.findFirst({
        where: { id: projectId, userId: user.id },
        select: { name: true },
      })
      if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 })
      projectName = project.name
    }

    const report = await computeMonthlyOperatingReport({
      userId: user.id,
      projectId,
      month: monthParam,
      store: {
        aimGeneration: {
          findMany: async (args) =>
            prisma.aimGeneration.findMany({
              where: args?.where as never,
              select: { id: true, workflowStatus: true, publishedAt: true, taskSpec: true },
              take: args?.take ?? 1000,
            }),
        },
        contentOutcome: {
          findMany: async (args) => {
            const rows = await prisma.contentOutcome.findMany({
              where: args?.where as never,
              select: {
                generationId: true,
                collectWindowDay: true,
                collectedAt: true,
                views: true,
                qualifiedLeadCount: true,
                appointmentCount: true,
                dealCount: true,
                revenue: true,
              },
              take: args?.take ?? 5000,
            })
            return rows.map((row) => ({ ...row, revenue: row.revenue == null ? null : Number(row.revenue) }))
          },
        },
        outcomeAttribution: {
          findMany: async (args) =>
            prisma.outcomeAttribution.findMany({
              where: args?.where as never,
              select: { generationId: true, attributionMethod: true },
              take: args?.take ?? 5000,
            }),
        },
      },
    })
    if (!report) return NextResponse.json({ error: "month 格式应为 YYYY-MM" }, { status: 400 })

    if (url.searchParams.get("format") === "json") {
      return NextResponse.json({ report, projectName })
    }

    const html = renderMonthlyReportHtml({ report, projectName, generatedAt: new Date() })
    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}

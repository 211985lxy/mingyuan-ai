import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { loadRetroReportData } from "@/lib/aim/retro-report-data"
import { renderRetroReportHtml } from "@/lib/aim/retro-report-html"

export const dynamic = "force-dynamic"

/**
 * @description 单条内容的 HTML 复盘报告（数据复盘官·输出 2 展示层）
 * @param request - 请求对象
 * @param options - 路由参数（内容 id）
 * @returns text/html 响应
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    const data = await loadRetroReportData(prisma, user.id, id)
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })

    return new NextResponse(renderRetroReportHtml(data), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}

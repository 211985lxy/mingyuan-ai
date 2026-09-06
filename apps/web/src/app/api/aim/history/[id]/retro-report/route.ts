import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { loadRetroReportData } from "@/lib/aim/retro-report-data"
import { renderRetroReportHtml } from "@/lib/aim/retro-report-html"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

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
    const project = await resolveBoundProject({ userId: user.id })

    const data = await loadRetroReportData(prisma, user.id, id, project.id)
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })

    return new NextResponse(renderRetroReportHtml(data), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}

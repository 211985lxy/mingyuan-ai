import { NextRequest, NextResponse } from "next/server"

import { exportOwnedProject } from "@/features/projects/services/project-lifecycle"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const data = await exportOwnedProject(user.id, id)
    if (!data) return NextResponse.json({ error: "客户项目不存在" }, { status: 404 })

    return NextResponse.json(data, {
      headers: { "Content-Disposition": `attachment; filename="project-${id}.json"` },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const message = error instanceof Error ? error.message : "项目导出失败"
    return NextResponse.json({ error: message }, { status: message.includes("超过") ? 413 : 500 })
  }
}

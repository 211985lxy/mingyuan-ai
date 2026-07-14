import { NextRequest, NextResponse } from "next/server"

import { exportOwnedProject } from "@/features/projects/services/project-lifecycle"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

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

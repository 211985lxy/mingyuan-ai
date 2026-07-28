import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { ownsActiveProject } from "@/lib/resource-ownership"
import { hasActiveStyleProfile } from "@/lib/style-profile"

/**
 * GET /api/aim/style-status?projectId=
 * 创作台「我的风格 · 已启用」状态。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || ""

    if (projectId && !(await ownsActiveProject(user.id, projectId))) {
      return NextResponse.json({ error: "IP 营销全案不存在或已归档" }, { status: 404 })
    }

    const status = await hasActiveStyleProfile(user.id, projectId || null)
    return NextResponse.json(status)
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ error: "风格状态读取失败" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { hasActiveStyleProfile } from "@/lib/style-profile"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

/**
 * GET /api/aim/style-status?projectId=
 * 创作台「我的风格 · 已启用」状态。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const requestedProjectId = request.nextUrl.searchParams.get("projectId")?.trim() || undefined
    const projectId = (await resolveBoundProject({ userId: user.id, requestedProjectId })).id

    const status = await hasActiveStyleProfile(user.id, projectId)
    return NextResponse.json(status)
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ error: "风格状态读取失败" }, { status: 500 })
  }
}

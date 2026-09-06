import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { runIpWikiLint } from "@/lib/ip-wiki/lint"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const maxDuration = 30

/** GET /api/aim/ip-wiki/lint?projectId=... —— 对某 IP 全案的维基页跑体检 */
/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const projectId = (await resolveBoundProject({
      userId: user.id,
      requestedProjectId: request.nextUrl.searchParams.get("projectId"),
    })).id

    const report = await runIpWikiLint({ projectId })
    return NextResponse.json({ report })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/ip-wiki/lint GET] Error:", error)
    return NextResponse.json({ error: "维基体检失败" }, { status: 500 })
  }
}

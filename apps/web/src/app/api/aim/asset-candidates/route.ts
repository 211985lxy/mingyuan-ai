import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { listAssetCandidates } from "@/lib/aim/asset-candidate-store"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const dynamic = "force-dynamic"

/** 列出当前用户的会后资产候选（90 天计划 3.1），支持项目 / 审核状态 / 类型过滤。 */
/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const params = request.nextUrl.searchParams
    const project = await resolveBoundProject({
      userId: user.id,
      requestedProjectId: params.get("projectId") || undefined,
    })
    const takeParam = Number(params.get("take"))
    const candidates = await listAssetCandidates({
      userId: user.id,
      projectId: project.id,
      reviewStatus: params.get("reviewStatus") || undefined,
      kind: params.get("kind") || undefined,
      take: Number.isFinite(takeParam) && takeParam > 0 ? takeParam : undefined,
    })
    return NextResponse.json({ candidates })
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

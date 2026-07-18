import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { listAssetCandidates } from "@/lib/aim/asset-candidate-store"

export const dynamic = "force-dynamic"

/** 列出当前用户的会后资产候选（90 天计划 3.1），支持项目 / 审核状态 / 类型过滤。 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const params = request.nextUrl.searchParams
    const takeParam = Number(params.get("take"))
    const candidates = await listAssetCandidates({
      userId: user.id,
      projectId: params.get("projectId") || undefined,
      reviewStatus: params.get("reviewStatus") || undefined,
      kind: params.get("kind") || undefined,
      take: Number.isFinite(takeParam) && takeParam > 0 ? takeParam : undefined,
    })
    return NextResponse.json({ candidates })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}

import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { generateMeetingAssetCandidates } from "@/lib/aim/asset-candidate-store"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const dynamic = "force-dynamic"

/**
 * 从已人工审核的会议洞察生成会后资产候选（90 天计划 3.1）。
 * 请求体 { "approve": true } 即人工审核动作（首次生成时必须）；
 * 审核过以后重复调用幂等，不重复创建。
 */
/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const project = await resolveBoundProject({ userId: user.id })

    let body: Record<string, unknown>
    try {
      body = await parseJsonRecord(request)
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 })
    }

    const result = await generateMeetingAssetCandidates({
      userId: user.id,
      generationId: id,
      projectId: project.id,
      approve: body.approve === true,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({
      created: result.created,
      skipped: result.skipped,
      candidates: result.candidates,
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

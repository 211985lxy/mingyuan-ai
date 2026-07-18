import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { generateMeetingAssetCandidates } from "@/lib/aim/asset-candidate-store"

export const dynamic = "force-dynamic"

/**
 * 从已人工审核的会议洞察生成会后资产候选（90 天计划 3.1）。
 * 请求体 { "approve": true } 即人工审核动作（首次生成时必须）；
 * 审核过以后重复调用幂等，不重复创建。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    let body: Record<string, unknown>
    try {
      body = await parseJsonRecord(request)
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 })
    }

    const result = await generateMeetingAssetCandidates({
      userId: user.id,
      generationId: id,
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
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}

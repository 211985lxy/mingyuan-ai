import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { reviewAssetCandidate } from "@/lib/aim/asset-candidate-store"

export const dynamic = "force-dynamic"

/**
 * 人工审核资产候选（90 天计划 3.1）。
 * 请求体：{ "action": "approve" | "reject", "promote"?: boolean, "crossProjectAllowed"?: boolean }
 * approve + promote=true 时升级为正式知识；未审核通过前不会升级。
 */
/**
 * @description 处理 PATCH 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function PATCH(
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

    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ error: "action 必须是 approve 或 reject" }, { status: 400 })
    }

    const result = await reviewAssetCandidate({
      userId: user.id,
      candidateId: id,
      action: body.action,
      promote: body.promote === true,
      crossProjectAllowed:
        typeof body.crossProjectAllowed === "boolean" ? body.crossProjectAllowed : undefined,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ candidate: result.record })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}

import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { reviewAssetCandidate } from "@/lib/aim/asset-candidate-store"
import {
  assertValidApprovalForHighRisk,
} from "@/lib/aim/workflow-governance"
import {
  createPrismaApprovalDecisionStore,
} from "@/lib/aim/approval-decision-prisma"
import { loadApprovalForSubject } from "@/lib/aim/approval-decision-store"

export const dynamic = "force-dynamic"

/**
 * 人工审核资产候选（90 天计划 3.1 / WP-2）。
 * 请求体：{ "action": "approve" | "reject", "promote"?: boolean, "approvalId"?: string, "crossProjectAllowed"?: boolean }
 * approve + promote=true 时必须引用有效 approvalId。
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

    const promote = body.promote === true
    if (promote) {
      const approvalId = typeof body.approvalId === "string" ? body.approvalId : null
      const store = createPrismaApprovalDecisionStore()
      const approval = await loadApprovalForSubject(store, approvalId, "asset", id)
      const gate = assertValidApprovalForHighRisk({
        action: "promote",
        approval,
        subjectType: "asset",
        subjectId: id,
      })
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: 403 })
      }
    }

    const result = await reviewAssetCandidate({
      userId: user.id,
      candidateId: id,
      action: body.action,
      promote,
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

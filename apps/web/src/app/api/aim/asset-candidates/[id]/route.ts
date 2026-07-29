import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { reviewAssetCandidate } from "@/lib/aim/asset-candidate-store"
import {
  validateHighRiskApproval,
} from "@/lib/aim/approval-validation"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function validatePromotion(
  id: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<NextResponse | null> {
  if (body.promote !== true) return null
  if (body.action !== "approve") {
    return NextResponse.json({ error: "仅 approve 可执行 promote" }, { status: 400 })
  }
  const workflowId =
    typeof body.workflowId === "string" ? body.workflowId.trim() : ""
  if (!workflowId) {
    return NextResponse.json({ error: "promote 缺少 workflowId" }, { status: 400 })
  }
  const candidate = await prisma.assetCandidate.findFirst({
    where: { id, userId },
    select: { projectId: true },
  })
  if (!candidate) {
    return NextResponse.json({ error: "候选不存在或无权操作" }, { status: 404 })
  }
  const approvalId = typeof body.approvalId === "string" ? body.approvalId : null
  const gate = await validateHighRiskApproval({
    action: "promote",
    approvalId,
    subjectType: "asset",
    subjectId: id,
    workflowId,
    projectId: candidate.projectId,
    expectedRoles: ["reviewer", "business_owner", "backup_owner", "system_owner"],
  })
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }
  if (body.crossProjectAllowed !== true) return null
  const crossProjectApprovalId =
    typeof body.crossProjectApprovalId === "string"
      ? body.crossProjectApprovalId
      : null
  if (!crossProjectApprovalId || crossProjectApprovalId === approvalId) {
    return NextResponse.json({
      error: "跨项目复用需独立的 system_owner approvalId",
    }, { status: 403 })
  }
  const crossProjectGate = await validateHighRiskApproval({
    action: "promote",
    approvalId: crossProjectApprovalId,
    subjectType: "asset",
    subjectId: id,
    workflowId,
    projectId: candidate.projectId,
    expectedRoles: ["system_owner"],
  })
  return crossProjectGate.ok
    ? null
    : NextResponse.json({ error: crossProjectGate.error }, { status: 403 })
}

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
    const promotionError = await validatePromotion(id, user.id, body)
    if (promotionError) return promotionError

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

import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { reviewAssetCandidate } from "@/lib/aim/asset-candidate-store"
import {
  validateHighRiskApproval,
} from "@/lib/aim/approval-validation"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function validateCrossProjectApproval(input: {
  id: string
  projectId: string
  workflowId: string
  approvalId: string | null
  body: Record<string, unknown>
}): Promise<NextResponse | null> {
  const crossProjectApprovalId =
    typeof input.body.crossProjectApprovalId === "string"
      ? input.body.crossProjectApprovalId
      : null
  if (!crossProjectApprovalId) {
    return NextResponse.json({
      error: "跨项目复用需独立的 system_owner approvalId",
    }, { status: 403 })
  }
  if (input.approvalId && crossProjectApprovalId === input.approvalId) {
    return NextResponse.json({
      error: "跨项目复用批准必须与主批准不同",
    }, { status: 403 })
  }
  const crossProjectGate = await validateHighRiskApproval({
    action: "promote",
    approvalId: crossProjectApprovalId,
    subjectType: "asset",
    subjectId: input.id,
    workflowId: input.workflowId,
    projectId: input.projectId,
    expectedRoles: ["system_owner"],
  })
  return crossProjectGate.ok
    ? null
    : NextResponse.json({ error: crossProjectGate.error }, { status: 403 })
}

/**
 * promote 或开启跨项目复用时的审批校验。
 * 无论 promote 是否为 true，只要把 crossProjectAllowed 从 false 开到 true，
 * 都必须有独立 system_owner approval。
 */
async function validatePromotion(
  id: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<NextResponse | null> {
  const promote = body.promote === true
  const enablingCrossProject = body.crossProjectAllowed === true
  if (!promote && !enablingCrossProject) return null
  if (promote && body.action !== "approve") {
    return NextResponse.json({ error: "仅 approve 可执行 promote" }, { status: 400 })
  }
  if (enablingCrossProject && body.action !== "approve") {
    return NextResponse.json({ error: "仅 approve 可开启跨项目复用" }, { status: 400 })
  }
  const workflowId =
    typeof body.workflowId === "string" ? body.workflowId.trim() : ""
  if (!workflowId) {
    return NextResponse.json({
      error: promote ? "promote 缺少 workflowId" : "开启跨项目复用缺少 workflowId",
    }, { status: 400 })
  }
  const candidate = await prisma.assetCandidate.findFirst({
    where: { id, userId },
    select: { projectId: true, crossProjectAllowed: true },
  })
  if (!candidate) {
    return NextResponse.json({ error: "候选不存在或无权操作" }, { status: 404 })
  }

  const approvalId = typeof body.approvalId === "string" ? body.approvalId : null
  if (promote) {
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
  }

  const needsCrossProjectApproval =
    enablingCrossProject && !candidate.crossProjectAllowed
  if (!needsCrossProjectApproval) return null
  return validateCrossProjectApproval({
    id,
    projectId: candidate.projectId,
    workflowId,
    approvalId: promote ? approvalId : null,
    body,
  })
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

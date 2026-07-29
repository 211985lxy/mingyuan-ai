import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { withAdminAuth } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  executeLearningApprovedAction,
  requireCandidateApproval,
  type LearningApprovalAction,
} from "@/lib/aim/learning-candidate-admin"
import { annotateLearningCandidate } from "@/lib/aim/learning-candidate-store"

export const dynamic = "force-dynamic"
const APPROVAL_ACTIONS = new Set([
  "approve",
  "reject",
  "promote_eval",
  "promote_methodology",
  "qualify_eval",
  "activate_eval",
])

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export const PATCH = withAdminAuth(async (
  request: NextRequest,
  { admin, params },
) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  try {
    let result: unknown
    if (body.action === "annotate") {
      const annotation = object(body.annotation)
      if (!annotation || Object.keys(annotation).length === 0) {
        return NextResponse.json({ error: "annotation 必须是非空对象" }, { status: 400 })
      }
      result = await annotateLearningCandidate({
        candidateId: id,
        annotation,
        reviewerId: admin.id,
      })
    } else {
      if (typeof body.action !== "string" || !APPROVAL_ACTIONS.has(body.action)) {
        return NextResponse.json({ error: "未知 action" }, { status: 400 })
      }
      const action = body.action as LearningApprovalAction
      const approvalId = typeof body.approvalId === "string" ? body.approvalId : ""
      const workflowId = typeof body.workflowId === "string" ? body.workflowId : ""
      const roles = action === "activate_eval"
        ? ["system_owner"] as const
        : ["reviewer", "business_owner", "backup_owner", "system_owner"] as const
      const gate = await requireCandidateApproval({
        candidateId: id,
        approvalId,
        workflowId,
        roles: [...roles],
        expectedDecision: action === "reject" ? "reject" : "approve",
      })
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 })
      result = await executeLearningApprovedAction({
        action,
        body,
        candidateId: id,
        reviewerId: gate.reviewerId,
        approvalId,
      })
    }
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: `learning_candidate.${body.action}`,
      targetType: "learning_candidate",
      targetId: id,
      metadata: {
        approvalId: typeof body.approvalId === "string" ? body.approvalId : null,
        result: JSON.parse(JSON.stringify(result)),
      } as Prisma.InputJsonValue,
    })
    return NextResponse.json({ result }, {
      headers: { "x-request-id": requestId },
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "学习候选操作失败",
    }, { status: 409 })
  }
}, "admin")

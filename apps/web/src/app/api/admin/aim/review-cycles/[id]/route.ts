import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { parseJsonRecord } from "@/lib/api-contract"
import { validateHighRiskApproval } from "@/lib/aim/approval-validation"
import {
  addReviewAction,
  signReviewCycle,
  updateReviewActionStatus,
} from "@/lib/aim/review-cycle-store"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function date(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function filterSnapshot(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function validateReviewCycleApproval(input: {
  reviewCycleId: string
  approvalId: string
  workflowId: string
}) {
  const cycle = await prisma.reviewCycle.findUnique({
    where: { id: input.reviewCycleId },
    select: { systemOwnerId: true, filterSnapshot: true },
  })
  if (!cycle) return { ok: false as const, error: "周复盘不存在" }
  const filters = filterSnapshot(cycle.filterSnapshot)
  if (
    typeof filters.workflowId === "string"
    && filters.workflowId !== input.workflowId
  ) return { ok: false as const, error: "workflowId 与周复盘筛选范围不匹配" }
  const approval = await prisma.approvalDecision.findUnique({
    where: { id: input.approvalId },
    select: {
      reviewerUserId: true,
      externalReviewerId: true,
      externalReviewerUserId: true,
    },
  })
  if (
    !approval
    || ![
      approval.reviewerUserId,
      approval.externalReviewerId,
      approval.externalReviewerUserId,
    ].includes(cycle.systemOwnerId)
  ) return { ok: false as const, error: "签字人不是该周期 systemOwnerId" }
  return validateHighRiskApproval({
    action: "complete",
    approvalId: input.approvalId,
    subjectType: "review_cycle",
    subjectId: input.reviewCycleId,
    workflowId: input.workflowId,
    projectId: typeof filters.projectId === "string" ? filters.projectId : null,
    expectedRoles: ["system_owner"],
  })
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
    if (body.action === "add_action") {
      result = await addReviewAction({
        reviewCycleId: id,
        draft: {
          title: typeof body.title === "string" ? body.title : "",
          ownerId: typeof body.ownerId === "string" ? body.ownerId : "",
          dueAt: date(body.dueAt) ?? new Date(Number.NaN),
          evidenceRef: typeof body.evidenceRef === "string" ? body.evidenceRef : undefined,
        },
      })
    } else if (body.action === "update_action") {
      result = await updateReviewActionStatus({
        actionId: typeof body.actionId === "string" ? body.actionId : "",
        status: typeof body.status === "string" ? body.status : "",
        evidenceRef: typeof body.evidenceRef === "string" ? body.evidenceRef : undefined,
      })
    } else if (body.action === "sign") {
      const approvalId = typeof body.approvalId === "string" ? body.approvalId : ""
      const workflowId = typeof body.workflowId === "string" ? body.workflowId : ""
      const gate = await validateReviewCycleApproval({ reviewCycleId: id, approvalId, workflowId })
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: 403 })
      }
      result = await signReviewCycle({ reviewCycleId: id, approvalId })
    } else {
      return NextResponse.json({ error: "未知 action" }, { status: 400 })
    }
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: `review_cycle.${body.action}`,
      targetType: "review_cycle",
      targetId: id,
      metadata: JSON.parse(JSON.stringify(result)),
    })
    return NextResponse.json({ result }, {
      headers: { "x-request-id": requestId },
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "周复盘操作失败",
    }, { status: 409 })
  }
}, "admin")

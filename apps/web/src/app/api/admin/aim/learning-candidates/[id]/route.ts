import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { withAdminAuth } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { parseJsonRecord } from "@/lib/api-contract"
import { validateHighRiskApproval } from "@/lib/aim/approval-validation"
import { listActiveGovernanceAssignments } from "@/lib/aim/approval-decision-prisma"
import {
  APPROVAL_MAX_AGE_MS,
  approvalStillMatchesAssignment,
  assertWorkflowGovernanceReady,
} from "@/lib/aim/workflow-governance"
import {
  activateEvalFixtureVersion,
  annotateLearningCandidate,
  decideLearningCandidate,
  markLearningCandidatePromoted,
  promoteLearningCandidateToEvalDraft,
  qualifyEvalFixtureVersion,
} from "@/lib/aim/learning-candidate-store"
import { createMethodologyProfileVersion } from "@/lib/methodology-profile-admin"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
const APPROVAL_ACTIONS = new Set([
  "approve",
  "reject",
  "promote_eval",
  "promote_methodology",
  "qualify_eval",
  "activate_eval",
])
type ApprovalAction =
  | "approve"
  | "reject"
  | "promote_eval"
  | "promote_methodology"
  | "qualify_eval"
  | "activate_eval"

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

async function requireCandidateApproval(input: {
  candidateId: string
  approvalId: string
  workflowId: string
  roles: Array<"reviewer" | "business_owner" | "backup_owner" | "system_owner">
  expectedDecision?: "approve" | "reject"
}) {
  const candidate = await prisma.learningCandidate.findUnique({
    where: { id: input.candidateId },
    select: { projectId: true },
  })
  if (!candidate) return { ok: false as const, error: "学习候选不存在" }
  const approval = await prisma.approvalDecision.findUnique({
    where: { id: input.approvalId },
  })
  if (input.expectedDecision === "reject") {
    const assignments = await listActiveGovernanceAssignments(input.workflowId)
    const ready = assertWorkflowGovernanceReady(assignments, {
      workflowId: input.workflowId,
    })
    if (!ready.ok) return { ok: false as const, error: ready.error }
    const decidedAt = approval ? new Date(approval.decidedAt).getTime() : Number.NaN
    const expired =
      !Number.isFinite(decidedAt)
      || Date.now() - decidedAt > APPROVAL_MAX_AGE_MS
    if (
      !approval
      || expired
      || approval.decision !== "reject"
      || approval.subjectType !== "learning_candidate"
      || approval.subjectId !== input.candidateId
      || approval.workflowId !== input.workflowId
      || approval.projectId !== candidate.projectId
      || !input.roles.includes(approval.roleSnapshot as never)
      || !approvalStillMatchesAssignment(
        approval as never,
        assignments,
        input.workflowId,
      )
    ) return { ok: false as const, error: "拒绝决定与候选、范围或当前审核角色不匹配" }
  } else {
    const gate = await validateHighRiskApproval({
      action: "promote",
      approvalId: input.approvalId,
      subjectType: "learning_candidate",
      subjectId: input.candidateId,
      workflowId: input.workflowId,
      projectId: candidate.projectId,
      expectedRoles: input.roles,
    })
    if (!gate.ok) return gate
  }
  const reviewerId =
    approval?.reviewerUserId
    ?? approval?.externalReviewerId
    ?? approval?.externalReviewerUserId
  return reviewerId
    ? { ok: true as const, reviewerId }
    : { ok: false as const, error: "approvalId 缺少可追溯审核人" }
}

async function promoteMethodologyCandidate(
  candidateId: string,
  reviewerId: string,
) {
  const candidate = await prisma.learningCandidate.findUnique({
    where: { id: candidateId },
  })
  if (!candidate) throw new Error("学习候选不存在")
  if (candidate.reviewStatus !== "approved") throw new Error("只有 approved 候选可晋升")
  if (candidate.targetType !== "methodology_revision") {
    throw new Error("候选目标不是 methodology_revision")
  }
  const payload = object(candidate.payload)
  const annotation = object(payload?.annotation)
  const profileId = typeof annotation?.profileId === "string"
    ? annotation.profileId
    : ""
  const compiledPrompt = typeof annotation?.compiledPrompt === "string"
    ? annotation.compiledPrompt
    : ""
  if (!profileId || !compiledPrompt) throw new Error("人工标注缺少 profileId/compiledPrompt")
  const version = await createMethodologyProfileVersion({
    profileId,
    compiledPrompt,
    contentMarkdown:
      typeof annotation?.contentMarkdown === "string"
        ? annotation.contentMarkdown
        : undefined,
    status: "draft",
  })
  await markLearningCandidatePromoted({
    candidateId,
    reviewerId,
    promotedRef: `methodology_version:${version.id}`,
  })
  return version
}

async function executeApprovedAction(input: {
  action: ApprovalAction
  body: Record<string, unknown>
  candidateId: string
  reviewerId: string
  approvalId: string
}) {
  if (input.action === "approve" || input.action === "reject") {
    return decideLearningCandidate({
      candidateId: input.candidateId,
      decision: input.action,
      reviewerId: input.reviewerId,
    })
  }
  if (input.action === "promote_eval") {
    return promoteLearningCandidateToEvalDraft({
      candidateId: input.candidateId,
      reviewerId: input.reviewerId,
    })
  }
  if (input.action === "promote_methodology") {
    return promoteMethodologyCandidate(input.candidateId, input.reviewerId)
  }
  if (input.action === "qualify_eval") {
    const metrics = object(input.body.metrics)
    if (!metrics) throw new Error("metrics 必须是对象")
    return qualifyEvalFixtureVersion({
      versionId: typeof input.body.versionId === "string" ? input.body.versionId : "",
      dailyPassed: input.body.dailyPassed === true,
      evidenceRef: typeof input.body.evidenceRef === "string" ? input.body.evidenceRef : "",
      metrics: metrics as never,
    })
  }
  return activateEvalFixtureVersion({
    versionId: typeof input.body.versionId === "string" ? input.body.versionId : "",
    approvalId: input.approvalId,
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
    if (body.action === "annotate") {
      const annotation = object(body.annotation)
      if (!annotation) return NextResponse.json({ error: "annotation 必须是对象" }, { status: 400 })
      result = await annotateLearningCandidate({
        candidateId: id,
        annotation,
        reviewerId: admin.id,
      })
    } else {
      if (typeof body.action !== "string" || !APPROVAL_ACTIONS.has(body.action)) {
        return NextResponse.json({ error: "未知 action" }, { status: 400 })
      }
      const action = body.action as ApprovalAction
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
      result = await executeApprovedAction({
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
      metadata: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
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

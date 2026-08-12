import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import {
  createPrismaApprovalDecisionStore,
  listActiveGovernanceAssignments,
} from "@/lib/aim/approval-decision-prisma"
import {
  ApprovalIdempotencyConflictError,
  recordApprovalDecision,
} from "@/lib/aim/approval-decision-store"
import { resolveApprovalSubjectScope } from "@/lib/aim/approval-validation"
import {
  APPROVAL_DECISIONS,
  APPROVAL_SUBJECT_TYPES,
  assertReviewerMatchesAssignment,
  assertWorkflowGovernanceReady,
  isApprovalDecisionCode,
  isApprovalSubjectType,
  isGovernanceRole,
  type GovernanceRole,
} from "@/lib/aim/workflow-governance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const SIGNABLE_SUBJECTS = new Set(
  APPROVAL_SUBJECT_TYPES.filter((subject) => subject !== "work_item"),
)
const LIST_MAX = 100
interface ApprovalDecisionDraft {
  subjectType: unknown
  subjectId: string
  decision: unknown
  workflowId: string
  requestedProjectId: string | null | undefined
  role: unknown
  reason: string
  requestId: string
}

function normalizeApprovalDecisionDraft(
  body: Record<string, unknown>,
): ApprovalDecisionDraft {
  return {
    subjectType: body.subjectType,
    subjectId: typeof body.subjectId === "string" ? body.subjectId.trim() : "",
    decision: body.decision,
    workflowId: typeof body.workflowId === "string" ? body.workflowId.trim() : "",
    requestedProjectId:
      body.projectId === null
        ? null
        : typeof body.projectId === "string"
          ? body.projectId.trim()
          : undefined,
    role: body.role,
    reason: typeof body.reason === "string" ? body.reason.trim() : "",
    requestId: typeof body.requestId === "string" ? body.requestId.trim() : "",
  }
}

function validateApprovalDecisionDraft(draft: ApprovalDecisionDraft): string | null {
  if (
    !isApprovalSubjectType(draft.subjectType)
    || draft.subjectType === "work_item"
    || !SIGNABLE_SUBJECTS.has(draft.subjectType)
  ) {
    return `subjectType 必须是 ${[...SIGNABLE_SUBJECTS].join(" / ")}`
  }
  if (!draft.subjectId || draft.subjectId.length > 191) {
    return "subjectId 必须为 1-191 字符"
  }
  if (!isApprovalDecisionCode(draft.decision)) {
    return `decision 必须是 ${APPROVAL_DECISIONS.join(" / ")}`
  }
  if (!draft.workflowId || draft.workflowId.length > 120) {
    return "workflowId 必须为 1-120 字符"
  }
  if (!isGovernanceRole(draft.role)) return "role 非法"
  if (!draft.reason || draft.reason.length > 2000) return "reason 必须为 1-2000 字符"
  if (!draft.requestId || draft.requestId.length > 120) {
    return "requestId 必须为 1-120 字符"
  }
  if (
    (draft.subjectType === "methodology" || draft.subjectType === "workflow_change")
    && draft.role !== "business_owner"
    && draft.role !== "system_owner"
  ) {
    return "方法论/工作流变更只能由 business_owner 或 system_owner 签字"
  }
  return null
}

async function persistApprovalDecision(input: {
  request: NextRequest
  adminId: string
  draft: ApprovalDecisionDraft
  subjectType: Exclude<(typeof APPROVAL_SUBJECT_TYPES)[number], "work_item">
  decision: (typeof APPROVAL_DECISIONS)[number]
  role: GovernanceRole
  projectId: string | null
}) {
  try {
    const result = await recordApprovalDecision(
      createPrismaApprovalDecisionStore(),
      {
        subjectType: input.subjectType,
        subjectId: input.draft.subjectId,
        decision: input.decision,
        reviewerUserId: input.adminId,
        roleSnapshot: input.role,
        reason: input.draft.reason,
        source: "web",
        requestId: input.draft.requestId,
        workflowId: input.draft.workflowId,
        projectId: input.projectId,
      },
    )
    const auditRequestId = await recordAdminAudit({
      request: input.request,
      adminId: input.adminId,
      action: "approval_decision.sign",
      targetType: input.subjectType,
      targetId: input.draft.subjectId,
      metadata: {
        approvalId: result.record.id,
        decision: input.decision,
        workflowId: input.draft.workflowId,
        projectId: input.projectId,
        role: input.role,
        idempotent: result.idempotent,
      },
    })
    return NextResponse.json(
      { item: result.record, idempotent: result.idempotent },
      {
        status: result.idempotent ? 200 : 201,
        headers: { "x-request-id": auditRequestId },
      },
    )
  } catch (error) {
    if (error instanceof ApprovalIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}

export const GET = withAdminOnly(async (request: NextRequest) => {
  const url = new URL(request.url)
  const subjectType = url.searchParams.get("subjectType")
  const subjectId = url.searchParams.get("subjectId")
  const workflowId = url.searchParams.get("workflowId")
  const where: Record<string, unknown> = {}
  if (subjectType && isApprovalSubjectType(subjectType)) where.subjectType = subjectType
  if (subjectId) where.subjectId = subjectId.slice(0, 191)
  if (workflowId) where.workflowId = workflowId.slice(0, 120)
  const items = await prisma.approvalDecision.findMany({
    where,
    orderBy: { decidedAt: "desc" },
    take: LIST_MAX,
  })
  return NextResponse.json({ items, limit: LIST_MAX })
})

export const POST = withAdminOnly(async (request: NextRequest, { admin }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  const draft = normalizeApprovalDecisionDraft(body)
  const validationError = validateApprovalDecisionDraft(draft)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }
  const { subjectId, workflowId, requestedProjectId, reason, requestId } = draft
  const subjectType = draft.subjectType as Exclude<
    (typeof APPROVAL_SUBJECT_TYPES)[number],
    "work_item"
  >
  const decision = draft.decision as (typeof APPROVAL_DECISIONS)[number]
  const role = draft.role as GovernanceRole

  const scope = await resolveApprovalSubjectScope(subjectType, subjectId, workflowId)
  if (!scope) {
    return NextResponse.json({ error: "审批事项不存在或范围不匹配" }, { status: 404 })
  }
  if (requestedProjectId !== undefined && requestedProjectId !== scope.projectId) {
    return NextResponse.json({ error: "projectId 与审批事项真实范围不匹配" }, { status: 400 })
  }

  const assignments = await listActiveGovernanceAssignments(workflowId)
  const ready = assertWorkflowGovernanceReady(assignments, { workflowId })
  if (!ready.ok) {
    return NextResponse.json({ error: ready.error }, { status: 403 })
  }
  const match = assertReviewerMatchesAssignment(assignments, {
    workflowId,
    reviewerUserId: admin.id,
    requiredRole: role,
  })
  if (!match.ok) {
    return NextResponse.json({ error: match.error }, { status: 403 })
  }

  return persistApprovalDecision({
    request,
    adminId: admin.id,
    draft: { ...draft, reason, requestId },
    subjectType,
    decision,
    role: match.role,
    projectId: scope.projectId,
  })
})

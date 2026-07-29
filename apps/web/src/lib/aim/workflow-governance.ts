/**
 * 工作流责任与审批签字（WP-2）
 * 缺 Owner 配置 fail closed；双签；审批人匹配；requestId 幂等；过期/拒绝 fail closed。
 */

export const GOVERNANCE_ROLES = [
  "business_owner",
  "system_owner",
  "reviewer",
  "backup_owner",
] as const

export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number]

export const GOVERNANCE_SCOPE_TYPES = ["system", "workflow"] as const
export type GovernanceScopeType = (typeof GOVERNANCE_SCOPE_TYPES)[number]

export const APPROVAL_SUBJECT_TYPES = [
  "work_item",
  "generation",
  "asset",
  "memory",
  "methodology",
  "workflow_change",
] as const
export type ApprovalSubjectType = (typeof APPROVAL_SUBJECT_TYPES)[number]

export const APPROVAL_DECISIONS = ["approve", "reject", "request_changes"] as const
export type ApprovalDecisionCode = (typeof APPROVAL_DECISIONS)[number]

export const APPROVAL_SOURCES = ["web", "feishu_card", "api"] as const
export type ApprovalSource = (typeof APPROVAL_SOURCES)[number]

/** 高风险动作：必须有有效 approvalId，集成密钥不得直接完成 */
export const HIGH_RISK_ACTIONS = ["complete", "publish", "promote"] as const
export type HighRiskAction = (typeof HIGH_RISK_ACTIONS)[number]

/** 集成密钥允许的动作 */
export const INTEGRATION_KEY_ALLOWED_ACTIONS = ["start", "submit_review", "fail"] as const

/** 需业务 Owner + 系统 Owner 双签的 subject */
export const DUAL_SIGN_SUBJECT_TYPES = ["methodology", "workflow_change"] as const

/** 审批签字默认最长有效期（7 天）；超时视为过期 */
export const APPROVAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export const APPROVAL_EFFECT_STATUSES = ["none", "pending", "applied", "failed"] as const
export type ApprovalEffectStatus = (typeof APPROVAL_EFFECT_STATUSES)[number]

export interface GovernanceAssignmentLike {
  scopeType: string
  scopeId: string
  role: string
  userId?: string | null
  externalOpenId?: string | null
  status: string
  effectiveAt: Date | string
}

export interface ApprovalDecisionInput {
  subjectType: ApprovalSubjectType
  subjectId: string
  decision: ApprovalDecisionCode
  reviewerUserId?: string | null
  externalReviewerId?: string | null
  roleSnapshot: string
  reason: string
  source: ApprovalSource
  requestId: string
  decidedAt?: Date
  workflowId?: string | null
  projectId?: string | null
  effectStatus?: ApprovalEffectStatus
  effectError?: string | null
}

export interface ApprovalDecisionRecord extends ApprovalDecisionInput {
  id: string
  effectStatus: ApprovalEffectStatus
}

export type GovernanceCheckResult =
  | { ok: true; assignments: GovernanceAssignmentLike[] }
  | { ok: false; error: string; code: "missing_owner" | "missing_reviewer" | "inactive" }

export type ReviewerMatchResult =
  | { ok: true; role: GovernanceRole }
  | { ok: false; error: string; code: "reviewer_mismatch" | "anonymous" }

export type DualSignResult =
  | { ok: true }
  | { ok: false; error: string; code: "dual_sign_required" }

const ROLE_SET = new Set<string>(GOVERNANCE_ROLES)
const SUBJECT_SET = new Set<string>(APPROVAL_SUBJECT_TYPES)
const DECISION_SET = new Set<string>(APPROVAL_DECISIONS)
const SOURCE_SET = new Set<string>(APPROVAL_SOURCES)
const HIGH_RISK_SET = new Set<string>(HIGH_RISK_ACTIONS)
const DUAL_SIGN_SET = new Set<string>(DUAL_SIGN_SUBJECT_TYPES)
const EFFECT_SET = new Set<string>(APPROVAL_EFFECT_STATUSES)

export function isGovernanceRole(value: unknown): value is GovernanceRole {
  return typeof value === "string" && ROLE_SET.has(value)
}

export function isApprovalSubjectType(value: unknown): value is ApprovalSubjectType {
  return typeof value === "string" && SUBJECT_SET.has(value)
}

export function isApprovalDecisionCode(value: unknown): value is ApprovalDecisionCode {
  return typeof value === "string" && DECISION_SET.has(value)
}

export function isApprovalSource(value: unknown): value is ApprovalSource {
  return typeof value === "string" && SOURCE_SET.has(value)
}

export function isHighRiskAction(value: unknown): value is HighRiskAction {
  return typeof value === "string" && HIGH_RISK_SET.has(value)
}

export function requiresDualSign(subjectType: string): boolean {
  return DUAL_SIGN_SET.has(subjectType)
}

export function isApprovalEffectStatus(value: unknown): value is ApprovalEffectStatus {
  return typeof value === "string" && EFFECT_SET.has(value)
}

function isActive(row: GovernanceAssignmentLike, at: Date): boolean {
  if (row.status !== "active") return false
  return new Date(row.effectiveAt).getTime() <= at.getTime()
}

function hasIdentity(row: GovernanceAssignmentLike): boolean {
  return Boolean(row.userId?.trim() || row.externalOpenId?.trim())
}

/**
 * 工作流必须配置业务 Owner、备份 Owner、审核人；系统 scope 必须有 system_owner。
 * 缺任一 → fail closed。
 */
export function assertWorkflowGovernanceReady(
  assignments: GovernanceAssignmentLike[],
  input: { workflowId: string; at?: Date },
): GovernanceCheckResult {
  const at = input.at ?? new Date()
  const workflowRows = assignments.filter(
    (row) =>
      row.scopeType === "workflow"
      && row.scopeId === input.workflowId
      && isActive(row, at)
      && hasIdentity(row),
  )
  const systemRows = assignments.filter(
    (row) => row.scopeType === "system" && isActive(row, at) && hasIdentity(row),
  )

  const requiredWorkflowRoles: GovernanceRole[] = [
    "business_owner",
    "backup_owner",
    "reviewer",
  ]
  for (const role of requiredWorkflowRoles) {
    if (!workflowRows.some((row) => row.role === role)) {
      return {
        ok: false,
        code: role === "reviewer" ? "missing_reviewer" : "missing_owner",
        error: `工作流 ${input.workflowId} 未配置有效 ${role}，fail closed。请先在治理配置录入。`,
      }
    }
  }

  if (!systemRows.some((row) => row.role === "system_owner")) {
    return {
      ok: false,
      code: "missing_owner",
      error: "系统未配置有效 system_owner，fail closed。请先在治理配置录入。",
    }
  }

  return { ok: true, assignments: [...workflowRows, ...systemRows] }
}

/**
 * 审批人必须匹配该工作流的 reviewer / business_owner / backup_owner / system_owner。
 */
export function assertReviewerMatchesAssignment(
  assignments: GovernanceAssignmentLike[],
  input: {
    workflowId: string
    reviewerUserId?: string | null
    externalReviewerId?: string | null
    at?: Date
  },
): ReviewerMatchResult {
  const userId = input.reviewerUserId?.trim() || ""
  const openId = input.externalReviewerId?.trim() || ""
  if (!userId && !openId) {
    return { ok: false, code: "anonymous", error: "审批人身份缺失，拒绝匿名签字。" }
  }

  const ready = assertWorkflowGovernanceReady(assignments, {
    workflowId: input.workflowId,
    at: input.at,
  })
  if (!ready.ok) {
    return { ok: false, code: "reviewer_mismatch", error: ready.error }
  }

  const allowedRoles: GovernanceRole[] = [
    "reviewer",
    "business_owner",
    "backup_owner",
    "system_owner",
  ]
  const hit = ready.assignments.find((row) => {
    if (!isGovernanceRole(row.role) || !allowedRoles.includes(row.role)) return false
    if (userId && row.userId === userId) return true
    if (openId && row.externalOpenId === openId) return true
    return false
  })

  if (!hit || !isGovernanceRole(hit.role)) {
    return {
      ok: false,
      code: "reviewer_mismatch",
      error: "审批人与工作流责任配置不匹配，拒绝签字。",
    }
  }
  return { ok: true, role: hit.role }
}

/**
 * 工作流或方法论变更需业务 Owner 与系统 Owner 双签。
 */
export function assertDualSignForChange(
  approvals: Array<{ decision: string; roleSnapshot: string; subjectId: string }>,
  subjectId: string,
): DualSignResult {
  const approved = approvals.filter(
    (row) => row.subjectId === subjectId && row.decision === "approve",
  )
  const hasBusiness = approved.some((row) => row.roleSnapshot === "business_owner")
  const hasSystem = approved.some((row) => row.roleSnapshot === "system_owner")
  if (!hasBusiness || !hasSystem) {
    return {
      ok: false,
      code: "dual_sign_required",
      error: "工作流/方法论变更需业务 Owner 与系统 Owner 双签。",
    }
  }
  return { ok: true }
}

export function parseApprovalDecisionInput(raw: unknown): ApprovalDecisionInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  if (!isApprovalSubjectType(obj.subjectType)) return null
  if (typeof obj.subjectId !== "string" || !obj.subjectId.trim()) return null
  if (!isApprovalDecisionCode(obj.decision)) return null
  if (typeof obj.roleSnapshot !== "string" || !obj.roleSnapshot.trim()) return null
  if (typeof obj.reason !== "string" || !obj.reason.trim()) return null
  if (!isApprovalSource(obj.source)) return null
  if (typeof obj.requestId !== "string" || !obj.requestId.trim()) return null
  return {
    subjectType: obj.subjectType,
    subjectId: obj.subjectId.trim(),
    decision: obj.decision,
    reviewerUserId: typeof obj.reviewerUserId === "string" ? obj.reviewerUserId : null,
    externalReviewerId: typeof obj.externalReviewerId === "string" ? obj.externalReviewerId : null,
    roleSnapshot: obj.roleSnapshot.trim(),
    reason: obj.reason.trim(),
    source: obj.source,
    requestId: obj.requestId.trim(),
    decidedAt: obj.decidedAt instanceof Date ? obj.decidedAt : undefined,
    workflowId: typeof obj.workflowId === "string" ? obj.workflowId.trim() : null,
    projectId: typeof obj.projectId === "string" ? obj.projectId.trim() : null,
  }
}

/**
 * 集成密钥只能 start / submit_review / fail，不得直接 complete/publish/promote。
 */
export function assertIntegrationKeyActionAllowed(action: string): {
  ok: true
} | { ok: false; error: string } {
  if (isHighRiskAction(action)) {
    return {
      ok: false,
      error: `集成密钥不得直接执行 ${action}；只能 submit_review，完成须引用有效 approvalId。`,
    }
  }
  return { ok: true }
}

function isApprovalExpired(
  approval: ApprovalDecisionRecord,
  at: Date,
  maxAgeMs: number,
): boolean {
  // 历史行可能没有 decidedAt（unknown）：不按过期拒绝，由调用方补齐新签字
  if (!approval.decidedAt) return false
  const decidedAt = new Date(approval.decidedAt).getTime()
  if (!Number.isFinite(decidedAt)) return false
  return at.getTime() - decidedAt > maxAgeMs
}

/**
 * complete/publish/promote 必须引用有效 approve 签字，且 subject/workflow/project/角色匹配。
 */
export function assertValidApprovalForHighRisk(input: {
  action: string
  approval: ApprovalDecisionRecord | null | undefined
  subjectType: ApprovalSubjectType
  subjectId: string
  workflowId?: string | null
  projectId?: string | null
  expectedRoles?: GovernanceRole[]
  at?: Date
  maxAgeMs?: number
}): { ok: true; approvalId: string } | { ok: false; error: string } {
  if (!isHighRiskAction(input.action)) {
    return { ok: true, approvalId: input.approval?.id ?? "" }
  }
  const approval = input.approval
  if (!approval) {
    return { ok: false, error: `${input.action} 必须引用有效 approvalId。` }
  }
  if (approval.decision === "reject" || approval.decision === "request_changes") {
    return { ok: false, error: `approvalId=${approval.id} 已拒绝/要求修改，拒绝执行。` }
  }
  if (approval.decision !== "approve") {
    return { ok: false, error: `approvalId=${approval.id} 不是 approve 决定，拒绝执行。` }
  }
  if (approval.subjectType !== input.subjectType || approval.subjectId !== input.subjectId) {
    return { ok: false, error: "approvalId 与事项不匹配，拒绝执行。" }
  }
  if (
    input.workflowId
    && approval.workflowId
    && approval.workflowId !== input.workflowId
  ) {
    return { ok: false, error: "approvalId 与工作流不匹配，拒绝跨工作流执行。" }
  }
  if (
    input.projectId
    && approval.projectId
    && approval.projectId !== input.projectId
  ) {
    return { ok: false, error: "approvalId 与项目不匹配，拒绝跨项目执行。" }
  }
  if (
    input.expectedRoles
    && input.expectedRoles.length > 0
    && !input.expectedRoles.includes(approval.roleSnapshot as GovernanceRole)
  ) {
    return { ok: false, error: "approvalId 角色与动作要求不匹配，拒绝执行。" }
  }
  const at = input.at ?? new Date()
  const maxAgeMs = input.maxAgeMs ?? APPROVAL_MAX_AGE_MS
  if (isApprovalExpired(approval, at, maxAgeMs)) {
    return { ok: false, error: `approvalId=${approval.id} 已过期，拒绝执行。` }
  }
  return { ok: true, approvalId: approval.id }
}

/** requestId 幂等：已有同 requestId 则返回已有记录，不新建 */
export function resolveIdempotentApproval(
  existingByRequestId: ApprovalDecisionRecord | null | undefined,
  draft: ApprovalDecisionInput & { id: string },
): { record: ApprovalDecisionRecord; idempotent: boolean } {
  if (existingByRequestId) {
    return { record: existingByRequestId, idempotent: true }
  }
  return {
    record: {
      ...draft,
      decidedAt: draft.decidedAt ?? new Date(),
      effectStatus: draft.effectStatus ?? "none",
    },
    idempotent: false,
  }
}

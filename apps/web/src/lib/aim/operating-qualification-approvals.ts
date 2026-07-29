export interface QualificationApprovalRow {
  id: string
  subjectType: string
  subjectId: string
  decision: string
  roleSnapshot: string
  workflowId: string | null
  reviewerUserId: string | null
  externalReviewerId: string | null
  externalReviewerUserId: string | null
  decidedAt: Date
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function qualificationApprovalId(metadata: unknown): string | null {
  const row = object(metadata)
  return typeof row?.approvalId === "string" && row.approvalId.trim()
    ? row.approvalId
    : null
}

export function expectedQualificationAuditSubject(
  action: string,
  targetId: string | null,
  metadata: unknown,
): { type: string; id: string } | null {
  if (!targetId) return null
  if (action.startsWith("learning_candidate.")) {
    return { type: "learning_candidate", id: targetId }
  }
  if (action === "methodology.update" || action === "methodology.reset") {
    return { type: "methodology", id: `builtin:${targetId}` }
  }
  if (action === "methodology_profile_version.publish") {
    const profileId = object(metadata)?.profileId
    return {
      type: "methodology",
      id: typeof profileId === "string" ? profileId : targetId,
    }
  }
  return action === "methodology_profile.update"
    ? { type: "methodology", id: targetId }
    : null
}

export function validQualificationApproval(
  approval: QualificationApprovalRow | undefined,
  occurredAt: Date,
  expected?: { type: string; id: string } | null,
  expectedDecision = "approve",
): boolean {
  return Boolean(
    approval
    && approval.decision === expectedDecision
    && approval.decidedAt.getTime() <= occurredAt.getTime()
    && (!expected
      || (approval.subjectType === expected.type
        && approval.subjectId === expected.id)),
  )
}

function reviewerIdentity(row: QualificationApprovalRow): string | null {
  if (row.reviewerUserId) return `internal:${row.reviewerUserId}`
  if (row.externalReviewerId) return `open:${row.externalReviewerId}`
  if (row.externalReviewerUserId) {
    return `external_user:${row.externalReviewerUserId}`
  }
  return null
}

export function hasQualificationMethodologyDualSign(
  approvals: QualificationApprovalRow[],
  expected: { type: string; id: string } | null,
  occurredAt: Date,
  workflowId: string | null,
): boolean {
  if (expected?.type !== "methodology" || !workflowId) return false
  const matching = approvals.filter((row) =>
    row.subjectType === expected.type
    && row.subjectId === expected.id
    && row.workflowId === workflowId
    && row.decision === "approve"
    && row.decidedAt.getTime() <= occurredAt.getTime())
  const business = matching.find((row) => row.roleSnapshot === "business_owner")
  const system = matching.find((row) => row.roleSnapshot === "system_owner")
  const businessId = business ? reviewerIdentity(business) : null
  const systemId = system ? reviewerIdentity(system) : null
  return Boolean(businessId && systemId && businessId !== systemId)
}

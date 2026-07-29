import { METHODOLOGY_META } from "@/lib/agent-methodology-store"
import {
  createPrismaApprovalDecisionStore,
  listActiveGovernanceAssignments,
} from "@/lib/aim/approval-decision-prisma"
import {
  loadApprovalForSubject,
  loadApprovalsForSubject,
} from "@/lib/aim/approval-decision-store"
import {
  approvalStillMatchesAssignment,
  assertDualSignForChange,
  assertValidApprovalForHighRisk,
  assertWorkflowGovernanceReady,
  type ApprovalSubjectType,
  type GovernanceRole,
} from "@/lib/aim/workflow-governance"
import { prisma } from "@/lib/prisma"

export interface ApprovalSubjectScope {
  projectId: string | null
}

export async function resolveApprovalSubjectScope(
  subjectType: ApprovalSubjectType,
  subjectId: string,
  workflowId: string,
): Promise<ApprovalSubjectScope | null> {
  if (subjectType === "asset") {
    return prisma.assetCandidate.findUnique({
      where: { id: subjectId },
      select: { projectId: true },
    })
  }
  if (subjectType === "memory") {
    return prisma.aimMemory.findUnique({
      where: { id: subjectId },
      select: { projectId: true },
    })
  }
  if (subjectType === "generation") {
    return prisma.aimGeneration.findUnique({
      where: { id: subjectId },
      select: { projectId: true },
    })
  }
  if (subjectType === "methodology") {
    if (subjectId.startsWith("builtin:")) {
      const key = subjectId.slice("builtin:".length)
      return Object.prototype.hasOwnProperty.call(METHODOLOGY_META, key)
        ? { projectId: null }
        : null
    }
    const profile = await prisma.methodologyProfile.findUnique({
      where: { id: subjectId },
      select: { id: true },
    })
    if (profile) return { projectId: null }
    const version = await prisma.methodologyProfileVersion.findUnique({
      where: { id: subjectId },
      select: { id: true },
    })
    return version ? { projectId: null } : null
  }
  if (subjectType === "workflow_change") {
    return subjectId === workflowId ? { projectId: null } : null
  }
  return null
}

export async function validateHighRiskApproval(input: {
  action: "complete" | "publish" | "promote"
  approvalId: string | null | undefined
  subjectType: ApprovalSubjectType
  subjectId: string
  workflowId: string
  projectId: string | null
  expectedRoles: GovernanceRole[]
  dualSign?: boolean
}) {
  const store = createPrismaApprovalDecisionStore()
  const approval = await loadApprovalForSubject(
    store,
    input.approvalId,
    input.subjectType,
    input.subjectId,
  )
  const assignments = await listActiveGovernanceAssignments(input.workflowId)
  const ready = assertWorkflowGovernanceReady(assignments, {
    workflowId: input.workflowId,
  })
  if (!ready.ok) return { ok: false as const, error: ready.error }

  const gate = assertValidApprovalForHighRisk({
    action: input.action,
    approval,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    workflowId: input.workflowId,
    projectId: input.projectId,
    expectedRoles: input.expectedRoles,
  })
  if (!gate.ok) return gate
  if (!approval || !approvalStillMatchesAssignment(
    approval,
    assignments,
    input.workflowId,
  )) {
    return {
      ok: false as const,
      error: "approvalId 的签字角色已不在当前 active GovernanceAssignment 中。",
    }
  }

  if (input.dualSign) {
    const approvals = await loadApprovalsForSubject(
      store,
      input.subjectType,
      input.subjectId,
    )
    const dual = assertDualSignForChange(approvals, {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      workflowId: input.workflowId,
      projectId: input.projectId,
      assignments,
    })
    if (!dual.ok) return { ok: false as const, error: dual.error }
  }
  return gate
}

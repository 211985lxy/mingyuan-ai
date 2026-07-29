/**
 * Prisma ApprovalDecision / GovernanceAssignment 适配（WP-2）
 */

import { prisma } from "@/lib/prisma"
import type {
  ApprovalDecisionRecord,
  ApprovalDecisionInput,
  ApprovalEffectStatus,
} from "@/lib/aim/workflow-governance"
import { isApprovalEffectStatus } from "@/lib/aim/workflow-governance"
import type { ApprovalDecisionStorePort } from "@/lib/aim/approval-decision-store"

const GOVERNANCE_ASSIGNMENT_LIST_CAP = 200

function mapRow(row: {
  id: string
  subjectType: string
  subjectId: string
  decision: string
  reviewerUserId: string | null
  externalReviewerId: string | null
  externalReviewerUserId?: string | null
  roleSnapshot: string
  reason: string
  source: string
  requestId: string
  decidedAt: Date
  workflowId?: string | null
  projectId?: string | null
  effectStatus?: string | null
  effectError?: string | null
  effectClaimToken?: string | null
  effectClaimedAt?: Date | null
}): ApprovalDecisionRecord {
  const effectStatus: ApprovalEffectStatus = isApprovalEffectStatus(row.effectStatus)
    ? row.effectStatus
    : "none"
  return {
    id: row.id,
    subjectType: row.subjectType as ApprovalDecisionRecord["subjectType"],
    subjectId: row.subjectId,
    decision: row.decision as ApprovalDecisionRecord["decision"],
    reviewerUserId: row.reviewerUserId,
    externalReviewerId: row.externalReviewerId,
    externalReviewerUserId: row.externalReviewerUserId ?? null,
    roleSnapshot: row.roleSnapshot,
    reason: row.reason,
    source: row.source as ApprovalDecisionRecord["source"],
    requestId: row.requestId,
    decidedAt: row.decidedAt,
    workflowId: row.workflowId ?? null,
    projectId: row.projectId ?? null,
    effectStatus,
    effectError: row.effectError ?? null,
    effectClaimToken: row.effectClaimToken ?? null,
    effectClaimedAt: row.effectClaimedAt ?? null,
  }
}

async function claimPrismaEffect(
  id: string,
  claimToken: string,
  options?: { now?: Date; leaseMs?: number },
) {
  const now = options?.now ?? new Date()
  const staleBefore = new Date(now.getTime() - (options?.leaseMs ?? 5 * 60 * 1000))
  const claimed = await prisma.approvalDecision.updateMany({
    where: {
      id,
      OR: [
        { effectStatus: { in: ["none", "failed"] } },
        { effectStatus: "pending", effectClaimedAt: null },
        { effectStatus: "pending", effectClaimedAt: { lt: staleBefore } },
      ],
    },
    data: {
      effectStatus: "pending",
      effectError: null,
      effectClaimToken: claimToken,
      effectClaimedAt: now,
    },
  })
  const row = await prisma.approvalDecision.findUnique({ where: { id } })
  if (!row) throw new Error(`ApprovalDecision ${id} 不存在`)
  return { claimed: claimed.count === 1, record: mapRow(row) }
}

async function settlePrismaEffect(
  id: string,
  claimToken: string,
  patch: { effectStatus: "applied" | "failed"; effectError?: string | null },
) {
  const settled = await prisma.approvalDecision.updateMany({
    where: { id, effectStatus: "pending", effectClaimToken: claimToken },
    data: {
      effectStatus: patch.effectStatus,
      effectError: patch.effectError ?? null,
      effectClaimToken: null,
      effectClaimedAt: null,
    },
  })
  const row = await prisma.approvalDecision.findUnique({ where: { id } })
  if (!row) throw new Error(`ApprovalDecision ${id} 不存在`)
  if (settled.count !== 1) {
    throw new Error("审批副作用 claim 已失效，拒绝覆盖其它执行者结果")
  }
  return mapRow(row)
}

const PRISMA_APPROVAL_DECISION_STORE: ApprovalDecisionStorePort = {
    async findByRequestId(requestId) {
      const row = await prisma.approvalDecision.findUnique({ where: { requestId } })
      return row ? mapRow(row) : null
    },
    async findById(id) {
      const row = await prisma.approvalDecision.findUnique({ where: { id } })
      return row ? mapRow(row) : null
    },
    async findBySubject(subjectType, subjectId) {
      const rows = await prisma.approvalDecision.findMany({
        where: { subjectType, subjectId },
        orderBy: { decidedAt: "desc" },
        take: 100,
      })
      return rows.map(mapRow)
    },
    async create(input: ApprovalDecisionInput & { id: string }) {
      const row = await prisma.approvalDecision.create({
        data: {
          id: input.id,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          decision: input.decision,
          reviewerUserId: input.reviewerUserId ?? null,
          externalReviewerId: input.externalReviewerId ?? null,
          externalReviewerUserId: input.externalReviewerUserId ?? null,
          roleSnapshot: input.roleSnapshot,
          reason: input.reason,
          source: input.source,
          requestId: input.requestId,
          decidedAt: input.decidedAt ?? new Date(),
          workflowId: input.workflowId ?? null,
          projectId: input.projectId ?? null,
          effectStatus: input.effectStatus ?? "none",
          effectError: input.effectError ?? null,
          effectClaimToken: input.effectClaimToken ?? null,
          effectClaimedAt:
            input.effectClaimedAt == null ? null : new Date(input.effectClaimedAt),
        },
      })
      return mapRow(row)
    },
    async updateEffect(id, patch) {
      const row = await prisma.approvalDecision.update({
        where: { id },
        data: {
          effectStatus: patch.effectStatus,
          effectError: patch.effectError ?? null,
          effectClaimToken:
            patch.effectStatus === "pending" ? undefined : null,
          effectClaimedAt:
            patch.effectStatus === "pending" ? undefined : null,
        },
      })
      return mapRow(row)
    },
    claimEffect: claimPrismaEffect,
    settleEffect: settlePrismaEffect,
}

export function createPrismaApprovalDecisionStore(): ApprovalDecisionStorePort {
  return PRISMA_APPROVAL_DECISION_STORE
}

/** 工作流 + 系统 scope 的活跃责任配置；强制上限，避免无界查询 */
export async function listActiveGovernanceAssignments(workflowId: string) {
  return prisma.governanceAssignment.findMany({
    where: {
      status: "active",
      OR: [
        { scopeType: "workflow", scopeId: workflowId },
        { scopeType: "system" },
      ],
    },
    take: GOVERNANCE_ASSIGNMENT_LIST_CAP,
  })
}

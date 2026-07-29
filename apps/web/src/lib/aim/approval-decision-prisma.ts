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
  roleSnapshot: string
  reason: string
  source: string
  requestId: string
  decidedAt: Date
  workflowId?: string | null
  projectId?: string | null
  effectStatus?: string | null
  effectError?: string | null
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
    roleSnapshot: row.roleSnapshot,
    reason: row.reason,
    source: row.source as ApprovalDecisionRecord["source"],
    requestId: row.requestId,
    decidedAt: row.decidedAt,
    workflowId: row.workflowId ?? null,
    projectId: row.projectId ?? null,
    effectStatus,
    effectError: row.effectError ?? null,
  }
}

export function createPrismaApprovalDecisionStore(): ApprovalDecisionStorePort {
  return {
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
        orderBy: { decidedAt: "asc" },
        take: 50,
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
          roleSnapshot: input.roleSnapshot,
          reason: input.reason,
          source: input.source,
          requestId: input.requestId,
          decidedAt: input.decidedAt ?? new Date(),
          workflowId: input.workflowId ?? null,
          projectId: input.projectId ?? null,
          effectStatus: input.effectStatus ?? "none",
          effectError: input.effectError ?? null,
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
        },
      })
      return mapRow(row)
    },
  }
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

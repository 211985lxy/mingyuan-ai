/**
 * Prisma ApprovalDecision / GovernanceAssignment 适配（WP-2）
 */

import { prisma } from "@/lib/prisma"
import type { ApprovalDecisionRecord, ApprovalDecisionInput } from "@/lib/aim/workflow-governance"
import type { ApprovalDecisionStorePort } from "@/lib/aim/approval-decision-store"

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
}): ApprovalDecisionRecord {
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
        },
      })
      return mapRow(row)
    },
  }
}

export async function listActiveGovernanceAssignments(workflowId: string) {
  return prisma.governanceAssignment.findMany({
    where: {
      status: "active",
      OR: [
        { scopeType: "workflow", scopeId: workflowId },
        { scopeType: "system" },
      ],
    },
  })
}

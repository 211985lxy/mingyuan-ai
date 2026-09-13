/**
 * L0 台账（WP-3.1）。开关关闭时零写入。
 * 失败吞掉，不挡灵感入库。
 */

import { recordApprovalDecision } from "@/lib/aim/approval-decision-store"
import { createPrismaApprovalDecisionStore } from "@/lib/aim/approval-decision-prisma"
import {
  AUTONOMY_L0_ACTION,
  autonomyL0RequestId,
  classifyInspirationPrescreen,
  isAutonomyL0Enabled,
} from "@/lib/aim/autonomy-l0"

export async function maybeRecordInspirationL0AutoPass(input: {
  userId: string
  inspirationId: string
  projectId?: string | null
  duplicate: boolean
  hasCanonicalUrl: boolean
}): Promise<{ autoPass: boolean }> {
  const verdict = classifyInspirationPrescreen({
    duplicate: input.duplicate,
    hasCanonicalUrl: input.hasCanonicalUrl,
  })
  const autoPass = isAutonomyL0Enabled() && verdict.autoPass
  if (!autoPass) return { autoPass: false }
  try {
    await recordApprovalDecision(createPrismaApprovalDecisionStore(), {
      subjectType: "workflow_change",
      subjectId: `inspiration:${input.inspirationId}`,
      decision: "approve",
      reviewerUserId: null,
      roleSnapshot: "system_owner",
      reason: `L0 auto_pass:${AUTONOMY_L0_ACTION} ${verdict.reason}`,
      source: "api",
      requestId: autonomyL0RequestId({
        userId: input.userId,
        inspirationId: input.inspirationId,
      }),
      projectId: input.projectId ?? null,
      effectStatus: "applied",
    })
  } catch {
    // 台账失败不挡重复早退
  }
  return { autoPass: true }
}

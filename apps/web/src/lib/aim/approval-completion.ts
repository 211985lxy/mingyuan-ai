/**
 * 飞书卡片审批 → 事项完成 可恢复状态机（WP-2）
 *
 * 流程：校验责任配置 → 写入 ApprovalDecision（requestId 幂等）→
 * 推进事项状态 → 更新 effectStatus。
 * 失败可重试；重放不重复完成（effectStatus=applied 直接返回）。
 */

import {
  assertReviewerMatchesAssignment,
  assertWorkflowGovernanceReady,
  type ApprovalDecisionRecord,
  type GovernanceAssignmentLike,
} from "@/lib/aim/workflow-governance"
import {
  recordApprovalDecision,
  type ApprovalDecisionStorePort,
} from "@/lib/aim/approval-decision-store"
import {
  completeWorkItem,
  startWorkItem,
  type WorkItemExecutionResult,
  type WorkItemRecordStore,
} from "@/lib/aim/services/work-item-execution"

export type CardApprovalAction = "approve" | "reject"

export interface ProcessCardApprovalInput {
  assignments: GovernanceAssignmentLike[]
  workflowId: string
  projectId?: string | null
  recordId: string
  action: CardApprovalAction
  openId: string
  userId: string
  messageId: string
  aimResultId: string
  workItemStore: WorkItemRecordStore
  approvalStore: ApprovalDecisionStorePort
  idFactory?: () => string
}

export type ProcessCardApprovalResult =
  | {
      ok: true
      approval: ApprovalDecisionRecord
      idempotent: boolean
      workItem?: WorkItemExecutionResult & { ok: true }
      toast: string
    }
  | {
      ok: false
      error: string
      approval?: ApprovalDecisionRecord
      recoverable?: boolean
    }

async function applyApproveEffect(
  input: ProcessCardApprovalInput,
  approval: ApprovalDecisionRecord,
): Promise<ProcessCardApprovalResult> {
  if (!input.aimResultId.trim()) {
    return { ok: false, error: "记录缺少 AIM结果ID，禁止无结果完成", approval }
  }

  await input.approvalStore.updateEffect(approval.id, {
    effectStatus: "pending",
    effectError: null,
  })

  let result: WorkItemExecutionResult
  try {
    result = await completeWorkItem(input.workItemStore, input.recordId, {
      aimResultId: input.aimResultId,
      resultSummary: `飞书卡片审核通过；approvalId=${approval.id}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "完成事项失败"
    const failed = await input.approvalStore.updateEffect(approval.id, {
      effectStatus: "failed",
      effectError: message,
    })
    return { ok: false, error: message, approval: failed, recoverable: true }
  }

  if (!result.ok) {
    const failed = await input.approvalStore.updateEffect(approval.id, {
      effectStatus: "failed",
      effectError: result.error,
    })
    return { ok: false, error: result.error, approval: failed, recoverable: true }
  }

  const updated = await input.approvalStore.updateEffect(approval.id, {
    effectStatus: "applied",
    effectError: null,
  })
  return {
    ok: true,
    approval: updated,
    idempotent: result.idempotent,
    workItem: result,
    toast: result.idempotent ? "已通过（幂等）" : "已通过审核",
  }
}

async function applyRejectEffect(
  input: ProcessCardApprovalInput,
  approval: ApprovalDecisionRecord,
): Promise<ProcessCardApprovalResult> {
  await input.approvalStore.updateEffect(approval.id, {
    effectStatus: "pending",
    effectError: null,
  })

  let result: WorkItemExecutionResult
  try {
    result = await startWorkItem(input.workItemStore, input.recordId)
  } catch (error) {
    const message = error instanceof Error ? error.message : "打回失败"
    const failed = await input.approvalStore.updateEffect(approval.id, {
      effectStatus: "failed",
      effectError: message,
    })
    return { ok: false, error: message, approval: failed, recoverable: true }
  }

  if (!result.ok) {
    const failed = await input.approvalStore.updateEffect(approval.id, {
      effectStatus: "failed",
      effectError: result.error,
    })
    return { ok: false, error: result.error, approval: failed, recoverable: true }
  }

  const updated = await input.approvalStore.updateEffect(approval.id, {
    effectStatus: "applied",
    effectError: null,
  })
  return {
    ok: true,
    approval: updated,
    idempotent: result.idempotent,
    workItem: result,
    toast: result.idempotent ? "已打回（幂等）" : "已打回重新处理",
  }
}

/**
 * 处理飞书卡片审批：签字落库 + 可恢复事项推进。
 */
export async function processFeishuCardApproval(
  input: ProcessCardApprovalInput,
): Promise<ProcessCardApprovalResult> {
  const ready = assertWorkflowGovernanceReady(input.assignments, {
    workflowId: input.workflowId,
  })
  if (!ready.ok) return { ok: false, error: ready.error }

  const match = assertReviewerMatchesAssignment(input.assignments, {
    workflowId: input.workflowId,
    reviewerUserId: input.userId || null,
    externalReviewerId: input.openId || null,
  })
  if (!match.ok) return { ok: false, error: match.error }

  const requestId = `feishu_card:${input.messageId}:${input.action}:${input.recordId}`
  const { record: approval, idempotent } = await recordApprovalDecision(
    input.approvalStore,
    {
      subjectType: "work_item",
      subjectId: input.recordId,
      decision: input.action === "approve" ? "approve" : "reject",
      reviewerUserId: input.userId || null,
      externalReviewerId: input.openId || null,
      roleSnapshot: match.role,
      reason: input.action === "approve" ? "飞书卡片审核通过" : "飞书卡片打回修改",
      source: "feishu_card",
      requestId,
      workflowId: input.workflowId,
      projectId: input.projectId ?? null,
      effectStatus: "none",
    },
    input.idFactory,
  )

  // 重放且侧效已应用：不重复完成
  if (idempotent && approval.effectStatus === "applied") {
    return {
      ok: true,
      approval,
      idempotent: true,
      toast: input.action === "approve" ? "已通过（幂等）" : "已打回（幂等）",
    }
  }

  if (input.action === "approve") {
    return applyApproveEffect(input, approval)
  }
  return applyRejectEffect(input, approval)
}

/**
 * HITL（Human-in-the-Loop）对话轴门闩（Step③）。
 *
 * 纪律不变：AI 不自动向客户发消息/报价/承诺，对外发送与写知识库
 * 必须有人批准。本模块把既有页面外审批内联进对话流：
 * 高风险工具动作先返回 `approval_required`，用户在对话内回复
 * 「批准 / 驳回」后（`settleHitlApproval` 落审批决策记录）才放行执行。
 *
 * 复用 approval-decision-store 的幂等审批记录（批准 + 执行的既有语义不动），
 * 灰度开关 `AIM_HITL_INLINE_ENABLED` 默认关闭：关闭时本模块零介入，
 * 行为与迁移前完全一致。
 */

import {
  recordApprovalDecision,
  type ApprovalDecisionStorePort,
} from "@/lib/aim/approval-decision-store"
import type { ApprovalDecisionRecord } from "@/lib/aim/workflow-governance"
import { createPrismaApprovalDecisionStore } from "@/lib/aim/approval-decision-prisma"

/** 对话轴的高风险工具动作清单：对外发送与写知识库两类。 */
export const HITL_HIGH_RISK_TOOL_ACTIONS: Record<
  string,
  { risk: "external_send" | "write_knowledge_base"; label: string }
> = {
  export_lark_generation: { risk: "external_send", label: "对外发送：把 AIM 内容回写飞书" },
  import_lark_topics: { risk: "write_knowledge_base", label: "写知识库：导入选题" },
  import_lark_project_data: { risk: "write_knowledge_base", label: "写知识库：导入项目数据" },
  import_lark_archive_data: { risk: "write_knowledge_base", label: "写知识库：导入归档数据" },
}

export type HitlDecisionCode = "approve" | "reject"

export interface HitlApprovalRequired {
  approvalRequestId: string
  toolAction: string
  risk: "external_send" | "write_knowledge_base"
  label: string
  status: "pending" | "rejected"
}

export type HitlGateDecision =
  | { gated: false }
  | { gated: true; approval: HitlApprovalRequired }

/** 灰度开关：默认关闭，关闭时 evaluateHitlGate 恒不拦截。声明见 src/env.ts；运行时动态读取便于灰度切换。 */
export function isHitlInlineEnabled(): boolean {
  return process.env.AIM_HITL_INLINE_ENABLED === "true"
}

/** HITL 决策前缀：evaluate 用它从 subject 的全部审批记录里筛出对话轴门闩记录。 */
const HITL_REQUEST_PREFIX = "hitl"

/** 审批请求幂等键：同一用户 + 同一动作 + 同一对象 + 同一决策（recordApprovalDecision 要求）。 */
export function hitlRequestId(
  input: {
    userId: string
    toolAction: string
    projectId?: string
    resultId?: string
    decision?: string
  },
): string {
  return [
    HITL_REQUEST_PREFIX,
    input.userId,
    input.toolAction,
    input.projectId || "-",
    input.resultId || "-",
    input.decision || "-",
  ].join(":")
}

function subjectOf(input: { userId: string; resultId?: string; toolAction: string }): {
  subjectType: "generation" | "workflow_change"
  subjectId: string
} {
  return input.resultId
    ? { subjectType: "generation", subjectId: input.resultId }
    : { subjectType: "workflow_change", subjectId: `chat:${input.userId}:${input.toolAction}` }
}

function defaultStore(): ApprovalDecisionStorePort {
  return createPrismaApprovalDecisionStore()
}

/**
 * @description 评估高风险动作是否需要人工审批
 * @param input - 用户/项目/工具动作上下文
 * @param store - 审批存储（测试可注入替身）
 * @returns gate 决策：未启用/非高风险/已批准 → 放行；其余返回审批需求
 */
export async function evaluateHitlGate(
  input: { userId: string; projectId?: string; toolAction: string; resultId?: string },
  store: ApprovalDecisionStorePort = defaultStore(),
): Promise<HitlGateDecision> {
  if (!isHitlInlineEnabled()) return { gated: false }
  const riskAction = HITL_HIGH_RISK_TOOL_ACTIONS[input.toolAction]
  if (!riskAction) return { gated: false }

  const { subjectType, subjectId } = subjectOf(input)
  const related = await store.findBySubject(subjectType, subjectId)
  const hitlRecords = related.filter((r) => r.requestId.startsWith(`${HITL_REQUEST_PREFIX}:${input.userId}:`))
  if (hitlRecords.some((r) => r.decision === "approve")) {
    // 已有人批准（幂等放行），不重复打扰
    return { gated: false }
  }
  const rejected = hitlRecords.some((r) => r.decision === "reject" || r.decision === "request_changes")

  return {
    gated: true,
    approval: {
      approvalRequestId: hitlRequestId(input),
      toolAction: input.toolAction,
      risk: riskAction.risk,
      label: riskAction.label,
      status: rejected ? "rejected" : "pending",
    },
  }
}

/**
 * @description 记录对话内的批准/驳回决策（幂等，重复批准不产生新记录）
 * @param input - 用户/项目/工具动作上下文 + 决策
 * @param store - 审批存储（测试可注入替身）
 * @returns proceed=true 表示批准，调用方可继续执行原动作
 */
export async function settleHitlApproval(
  input: {
    userId: string
    projectId?: string
    toolAction: string
    resultId?: string
    decision: HitlDecisionCode
  },
  store: ApprovalDecisionStorePort = defaultStore(),
): Promise<{ proceed: boolean; record: ApprovalDecisionRecord }> {
  const { subjectType, subjectId } = subjectOf(input)
  const { record } = await recordApprovalDecision(store, {
    subjectType,
    subjectId,
    decision: input.decision,
    reviewerUserId: input.userId,
    roleSnapshot: "owner",
    reason: "对话内人工审批（HITL gate）",
    source: "web",
    requestId: hitlRequestId({ ...input, decision: input.decision }),
    projectId: input.projectId || null,
  })
  return { proceed: input.decision === "approve", record }
}


// ── 飞书卡片审批（Step③ P1 交互卡片）─────────────────────────────────────

export interface FeishuCardSettleInput {
  /** 卡片 value 里带回的原审批请求 ID（hitl:{userId}:{toolAction}:{projectId}:{resultId}，自含全部上下文） */
  requestId: string
  /** 飞书审批人身份（open_id 或 user_id） */
  reviewerId: string
  decision: HitlDecisionCode
}

/**
 * @description 结算飞书卡片上的审批：按卡片带回的原 requestId 落决策记录。
 * 幂等键追加 `:feishu:{reviewerId}`，与控制台对话内审批互不覆盖；
 * evaluateHitlGate 按 subject 前缀扫描，任一 approve 记录即放行。
 */
export interface HitlRequestContext {
  userId: string
  toolAction: string
  projectId?: string
  resultId?: string
}

/** @description 从 hitl:… requestId 反解上下文（段位即 hitlRequestId 的构造序）。 */
export function parseHitlRequestId(requestId: string): HitlRequestContext | null {
  const parts = requestId.split(":")
  if (parts.length !== 6 || parts[0] !== "hitl") return null
  const [prefix, userId, toolAction, projectId, resultId] = parts
  if (prefix !== "hitl") return null
  return {
    userId,
    toolAction,
    projectId: projectId === "-" ? undefined : projectId,
    resultId: resultId === "-" ? undefined : resultId,
  }
}

export async function settleHitlApprovalForCard(
  input: FeishuCardSettleInput,
  store: ApprovalDecisionStorePort = defaultStore(),
): Promise<{ proceed: boolean; record: ApprovalDecisionRecord }> {
  const context = parseHitlRequestId(input.requestId)
  if (!context) {
    throw new Error(`HITL requestId 格式不合法：${input.requestId}`)
  }
  const { subjectType, subjectId } = subjectOf({
    userId: context.userId,
    resultId: context.resultId,
    toolAction: context.toolAction,
  })
  const { record } = await recordApprovalDecision(store, {
    subjectType,
    subjectId,
    decision: input.decision,
    reviewerUserId: null,
    externalReviewerId: input.reviewerId,
    roleSnapshot: "owner",
    reason: "飞书卡片人工审批（HITL gate）",
    source: "feishu_card",
    requestId: `${input.requestId}:feishu:${input.reviewerId}`,
    projectId: context.projectId || null,
  })
  return { proceed: input.decision === "approve", record }
}


/**
 * 本轮执行引擎解析（技能跨引擎委托）。
 *
 * 会话归属（sessionAgentId）与本轮执行引擎（executionAgentId）是两件事：
 * 前者决定历史、记忆、侧栏高亮挂在谁名下，后者决定这一轮用哪套 handler /
 * 模型链 / 知识策略。技能按钮带 `skill.agentId` 时只改后者，会话不跳台。
 */
import { isValidAimAgent, normalizeAimAgentId } from "@/lib/aim-harness/contracts"

export interface ResolvedAimExecutionAgent {
  /** 会话归属智能体（逐字保留请求原值，未委托路径行为零变化） */
  sessionAgentId: string
  /** 本轮实际执行引擎；未委托时与 sessionAgentId 逐字相同 */
  executionAgentId: string
  /** 是否发生跨引擎委托 */
  delegated: boolean
  /**
   * 请求带了执行引擎字段但不是合法 AimAgentId，已回落到会话智能体。
   * 保留原值供 trace 记录，避免非法输入被静默吞掉。
   */
  rejectedExecutionAgentId?: string
}

/**
 * @description 解析本轮执行引擎
 * @param input - 会话智能体 + 请求侧声明的执行引擎
 * @returns ResolvedAimExecutionAgent
 */
export function resolveAimExecutionAgent(input: {
  sessionAgentId: string | null | undefined
  requestedExecutionAgentId?: unknown
}): ResolvedAimExecutionAgent {
  const sessionAgentId = typeof input.sessionAgentId === "string" ? input.sessionAgentId : ""
  const noDelegation: ResolvedAimExecutionAgent = {
    sessionAgentId,
    executionAgentId: sessionAgentId,
    delegated: false,
  }

  const requested = typeof input.requestedExecutionAgentId === "string"
    ? input.requestedExecutionAgentId.trim()
    : ""
  if (!requested) return noDelegation

  // 只有合法 AimAgentId（含旧别名）才能换引擎；外部传任意字符串一律回落会话智能体，
  // 既不抛错也不落到 DEFAULT_AIM_AGENT，避免串台。
  if (!isValidAimAgent(requested)) {
    return { ...noDelegation, rejectedExecutionAgentId: requested }
  }

  const executionAgentId = normalizeAimAgentId(requested)
  if (executionAgentId === normalizeAimAgentId(sessionAgentId)) return noDelegation

  return { sessionAgentId, executionAgentId, delegated: true }
}

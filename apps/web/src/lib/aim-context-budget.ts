import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"

export interface AimContextBlocks {
  conversationBlock: string
  knowledgeBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  viralStructureBlock: string
  eventStorytellingBlock: string
  ipWikiBlock: string
  /** ADR-002：本次指定命名方法论（独立预算块，不与系统方法论争预算）。 */
  selectedMethodologyBlock: string
}

type AimContextBlockKey = keyof AimContextBlocks

interface AimContextBudgetProfile {
  totalChars: number
  priority: AimContextBlockKey[]
  blockCaps: Partial<Record<AimContextBlockKey, number>>
}

const DEFAULT_PRIORITY: AimContextBlockKey[] = [
  "conversationBlock",
  "ipWikiBlock",
  "selectedMethodologyBlock",
  "methodologyBlock",
  "knowledgeBlock",
  "businessDiagnosisBlock",
  "eventStorytellingBlock",
  "viralStructureBlock",
]

export const AIM_CONTEXT_BUDGET_PROFILES: Record<AimRuntimeTask, AimContextBudgetProfile> = {
  light_edit: {
    totalChars: 5_000,
    priority: DEFAULT_PRIORITY,
    blockCaps: { conversationBlock: 1_500, knowledgeBlock: 2_000, ipWikiBlock: 1_000, selectedMethodologyBlock: 1_200, methodologyBlock: 1_500 },
  },
  rewrite_copy: {
    totalChars: 9_000,
    priority: DEFAULT_PRIORITY,
    blockCaps: { conversationBlock: 1_500, ipWikiBlock: 2_500, selectedMethodologyBlock: 1_500, knowledgeBlock: 3_500, methodologyBlock: 2_500 },
  },
  new_copy: {
    totalChars: 14_000,
    priority: [
      "conversationBlock",
      "ipWikiBlock",
      "selectedMethodologyBlock",
      "methodologyBlock",
      "knowledgeBlock",
      "eventStorytellingBlock",
      "viralStructureBlock",
      "businessDiagnosisBlock",
    ],
    blockCaps: {
      conversationBlock: 1_000,
      ipWikiBlock: 3_000,
      selectedMethodologyBlock: 2_000,
      methodologyBlock: 3_500,
      knowledgeBlock: 4_000,
      eventStorytellingBlock: 1_800,
      viralStructureBlock: 1_200,
    },
  },
  positioning_topic: {
    totalChars: 16_000,
    priority: [
      "conversationBlock",
      "ipWikiBlock",
      "selectedMethodologyBlock",
      "businessDiagnosisBlock",
      "methodologyBlock",
      "knowledgeBlock",
      "viralStructureBlock",
      "eventStorytellingBlock",
    ],
    blockCaps: {
      conversationBlock: 1_500,
      ipWikiBlock: 4_500,
      selectedMethodologyBlock: 2_500,
      businessDiagnosisBlock: 3_000,
      methodologyBlock: 3_500,
      knowledgeBlock: 3_500,
    },
  },
  quality_review: {
    totalChars: 8_000,
    priority: [
      "conversationBlock",
      "knowledgeBlock",
      "selectedMethodologyBlock",
      "methodologyBlock",
      "ipWikiBlock",
      "businessDiagnosisBlock",
      "viralStructureBlock",
      "eventStorytellingBlock",
    ],
    blockCaps: { conversationBlock: 1_500, knowledgeBlock: 4_500, selectedMethodologyBlock: 1_200, methodologyBlock: 1_500, ipWikiBlock: 500 },
  },
}

const TRUNCATION_MARKER = "\n（该上下文已按预算截断）"

/**
 * agent 级预算修正：在 runtimeTask 基准上叠加 agent 维度的总量与块上限调整。
 * - free_copywriter：知识依赖低，压缩知识块、放大对话块
 * - work_editor：二改/排版，知识够用即可，不必按深度长文堆知识
 */
const AGENT_BUDGET_OVERRIDES: Partial<Record<string, { totalChars?: number; blockCaps?: Partial<Record<AimContextBlockKey, number>> }>> = {
  free_copywriter: {
    totalChars: 6_000,
    blockCaps: { knowledgeBlock: 1_500, conversationBlock: 2_500, methodologyBlock: 800 },
  },
  work_editor: {
    totalChars: 10_000,
    blockCaps: { knowledgeBlock: 2_500, conversationBlock: 3_000, eventStorytellingBlock: 800, ipWikiBlock: 2_000 },
  },
}

function truncateBlock(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  if (maxChars <= 0) return ""
  if (maxChars <= TRUNCATION_MARKER.length) return value.slice(0, maxChars)
  return `${value.slice(0, maxChars - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`
}

/**
 * @description 按任务类型和 Agent 级预算对上下文块进行截断分配，确保不超出总字符数限制
 * @param input - 原始上下文块内容
 * @param runtimeTask - 运行时任务类型（light_edit、rewrite_copy、new_copy 等）
 * @param agentId - 可选的 Agent ID，用于叠加 agent 级预算修正
 * @returns 截断后的上下文块及统计信息（预算、原始字符数、包含字符数、被截断的块）
 */
export function applyAimContextBudget(
  input: AimContextBlocks,
  runtimeTask: AimRuntimeTask,
  agentId?: string,
): {
  blocks: AimContextBlocks
  stats: {
    budgetChars: number
    originalChars: number
    includedChars: number
    truncatedBlocks: AimContextBlockKey[]
  }
} {
  const baseProfile = AIM_CONTEXT_BUDGET_PROFILES[runtimeTask]
  // 叠加 agent 级修正
  const agentOverride = agentId ? AGENT_BUDGET_OVERRIDES[agentId] : undefined
  const profile: AimContextBudgetProfile = agentOverride
    ? {
        totalChars: agentOverride.totalChars ?? baseProfile.totalChars,
        priority: baseProfile.priority,
        blockCaps: { ...baseProfile.blockCaps, ...agentOverride.blockCaps },
      }
    : baseProfile
  const blocks = Object.fromEntries(
    (Object.keys(input) as AimContextBlockKey[]).map((key) => [key, ""]),
  ) as unknown as AimContextBlocks
  const truncatedBlocks: AimContextBlockKey[] = []
  let remaining = profile.totalChars

  for (const key of profile.priority) {
    const value = input[key] ?? ""
    if (!value) continue
    const blockCap = profile.blockCaps[key] ?? remaining
    const included = truncateBlock(value, Math.min(blockCap, remaining))
    blocks[key] = included
    remaining -= included.length
    if (included.length < value.length) truncatedBlocks.push(key)
  }

  const originalChars = Object.values(input).reduce((sum, value) => sum + value.length, 0)
  const includedChars = Object.values(blocks).reduce((sum, value) => sum + value.length, 0)
  return {
    blocks,
    stats: {
      budgetChars: profile.totalChars,
      originalChars,
      includedChars,
      truncatedBlocks,
    },
  }
}

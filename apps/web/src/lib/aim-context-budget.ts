import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"

export interface AimContextBlocks {
  conversationBlock: string
  knowledgeBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  viralStructureBlock: string
  eventStorytellingBlock: string
  ipWikiBlock: string
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
  "knowledgeBlock",
  "methodologyBlock",
  "businessDiagnosisBlock",
  "eventStorytellingBlock",
  "viralStructureBlock",
]

export const AIM_CONTEXT_BUDGET_PROFILES: Record<AimRuntimeTask, AimContextBudgetProfile> = {
  light_edit: {
    totalChars: 5_000,
    priority: DEFAULT_PRIORITY,
    blockCaps: { conversationBlock: 1_500, knowledgeBlock: 2_000, ipWikiBlock: 1_000, methodologyBlock: 500 },
  },
  rewrite_copy: {
    totalChars: 9_000,
    priority: DEFAULT_PRIORITY,
    blockCaps: { conversationBlock: 1_500, ipWikiBlock: 2_500, knowledgeBlock: 3_500, methodologyBlock: 1_500 },
  },
  new_copy: {
    totalChars: 14_000,
    priority: [
      "conversationBlock",
      "ipWikiBlock",
      "knowledgeBlock",
      "eventStorytellingBlock",
      "viralStructureBlock",
      "methodologyBlock",
      "businessDiagnosisBlock",
    ],
    blockCaps: {
      conversationBlock: 1_000,
      ipWikiBlock: 3_000,
      knowledgeBlock: 4_500,
      eventStorytellingBlock: 1_800,
      viralStructureBlock: 1_200,
      methodologyBlock: 2_500,
    },
  },
  positioning_topic: {
    totalChars: 16_000,
    priority: [
      "conversationBlock",
      "ipWikiBlock",
      "businessDiagnosisBlock",
      "methodologyBlock",
      "knowledgeBlock",
      "viralStructureBlock",
      "eventStorytellingBlock",
    ],
    blockCaps: {
      conversationBlock: 1_500,
      ipWikiBlock: 4_500,
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
      "methodologyBlock",
      "ipWikiBlock",
      "businessDiagnosisBlock",
      "viralStructureBlock",
      "eventStorytellingBlock",
    ],
    blockCaps: { conversationBlock: 1_500, knowledgeBlock: 4_500, methodologyBlock: 1_500, ipWikiBlock: 500 },
  },
}

const TRUNCATION_MARKER = "\n（该上下文已按预算截断）"

function truncateBlock(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  if (maxChars <= 0) return ""
  if (maxChars <= TRUNCATION_MARKER.length) return value.slice(0, maxChars)
  return `${value.slice(0, maxChars - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`
}

export function applyAimContextBudget(
  input: AimContextBlocks,
  runtimeTask: AimRuntimeTask,
): {
  blocks: AimContextBlocks
  stats: {
    budgetChars: number
    originalChars: number
    includedChars: number
    truncatedBlocks: AimContextBlockKey[]
  }
} {
  const profile = AIM_CONTEXT_BUDGET_PROFILES[runtimeTask]
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

/**
 * 母内容 JSON 解析（从 canonical-content-spec 拆出，满足架构体积护栏）
 * 仅使用 import type，避免与 canonical-content-spec 形成运行时循环依赖。
 */

import type { TaskSpec } from "@/lib/task-spec"
import type {
  CanonicalContentGoal,
  CanonicalContentSpec,
  CanonicalContentVersionSnapshot,
  CanonicalEvidenceItem,
  CanonicalKnowledgeRef,
  CanonicalModelAssumption,
} from "@/lib/canonical-content-spec"

const CANONICAL_CONTENT_GOALS = ["曝光", "信任", "获客", "成交"] as const
const CANONICAL_EVIDENCE_SOURCE_TYPES = [
  "user_input",
  "knowledge",
  "meeting",
  "hot_topic",
  "benchmark",
  "model_assumption",
] as const

function cleanText(value: unknown, max = 500): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, max)
}

function isEvidenceItem(value: unknown): value is CanonicalEvidenceItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.statement === "string" &&
    (CANONICAL_EVIDENCE_SOURCE_TYPES as readonly string[]).includes(String(item.sourceType))
  )
}

/**
 * @description 从任意 JSON 解析母内容；非法返回 null
 */
export function parseCanonicalContentSpec(value: unknown): CanonicalContentSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1) return null
  const coreMessage = cleanText(input.coreMessage, 300)
  if (!coreMessage) return null
  const contentGoalRaw = cleanText(input.contentGoal, 10)
  const contentGoal = (CANONICAL_CONTENT_GOALS as readonly string[]).includes(contentGoalRaw)
    ? (contentGoalRaw as CanonicalContentGoal)
    : "信任"
  const status = input.status === "confirmed" ? "confirmed" : "draft"
  const version = typeof input.version === "number" && input.version >= 0 ? Math.floor(input.version) : 0

  const evidence = Array.isArray(input.evidence) ? input.evidence.filter(isEvidenceItem).slice(0, 24) : []
  const knowledgeUsed = Array.isArray(input.knowledgeUsed)
    ? input.knowledgeUsed
        .filter((item): item is CanonicalKnowledgeRef => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return false
          const row = item as Record<string, unknown>
          return typeof row.id === "string" && typeof row.title === "string"
        })
        .map((item) => ({
          id: item.id,
          title: cleanText(item.title, 200),
          category: cleanText(item.category, 80) || "unknown",
          ...(typeof (item as CanonicalKnowledgeRef).categoryLabel === "string"
            ? { categoryLabel: cleanText((item as CanonicalKnowledgeRef).categoryLabel || "", 80) }
            : {}),
          ...(typeof (item as CanonicalKnowledgeRef).snippet === "string"
            ? { snippet: cleanText((item as CanonicalKnowledgeRef).snippet || "", 160) }
            : {}),
        }))
        .slice(0, 30)
    : []

  const mustKeep = Array.isArray(input.mustKeep)
    ? input.mustKeep.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 8)
    : []
  const avoid = Array.isArray(input.avoid)
    ? input.avoid.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 8)
    : []
  const missingEvidence = Array.isArray(input.missingEvidence)
    ? input.missingEvidence.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 10)
    : []
  const modelAssumptions = Array.isArray(input.modelAssumptions)
    ? input.modelAssumptions
        .filter((item): item is CanonicalModelAssumption => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return false
          return typeof (item as { statement?: unknown }).statement === "string"
        })
        .map((item) => ({
          statement: cleanText(item.statement, 300),
          impact: item.impact,
        }))
        .filter((item) => item.statement)
        .slice(0, 10)
    : []

  return {
    schemaVersion: 1,
    version,
    status,
    confirmedAt: typeof input.confirmedAt === "string" ? input.confirmedAt : undefined,
    coreMessage,
    targetCustomer: cleanText(input.targetCustomer, 200),
    realProblem: cleanText(input.realProblem, 300),
    contentGoal,
    evidence,
    personaAngle: cleanText(input.personaAngle, 300) || undefined,
    productBridge: cleanText(input.productBridge, 300) || undefined,
    desiredAction: cleanText(input.desiredAction, 120) || "进一步咨询",
    mustKeep,
    avoid,
    missingEvidence,
    modelAssumptions,
    currentInput: cleanText(input.currentInput, 2000) || undefined,
    knowledgeUsed,
    versionHistory: Array.isArray(input.versionHistory)
      ? (input.versionHistory as CanonicalContentVersionSnapshot[]).slice(-20)
      : [],
  }
}

/**
 * @description 从 TaskSpec JSON 读取母内容
 */
export function getCanonicalFromTaskSpec(taskSpec: unknown): CanonicalContentSpec | null {
  if (!taskSpec || typeof taskSpec !== "object" || Array.isArray(taskSpec)) return null
  return parseCanonicalContentSpec((taskSpec as { canonical?: unknown }).canonical)
}

/**
 * @description 将母内容写入 TaskSpec（不改其他字段）
 */
export function withCanonicalOnTaskSpec(
  taskSpec: TaskSpec | null | undefined,
  canonical: CanonicalContentSpec,
): TaskSpec {
  if (!taskSpec) {
    throw new Error("taskSpec 缺失，无法挂载母内容")
  }
  return { ...taskSpec, canonical }
}

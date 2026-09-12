/**
 * 学习注入（WP-2.2）。
 *
 * 已批准的 methodology_revision / skill_draft 候选变成生成时约束。
 * eval_fixture 类候选不进这条路。topK ≤ 5。null/空不编造。
 */

import { createHash } from "node:crypto"
import type { LearningTargetType } from "@/lib/aim/learning-candidate"

export const LEARNING_INJECTION_TOP_K = 5
export const LEARNING_INJECTION_TARGETS: readonly LearningTargetType[] = [
  "methodology_revision",
  "skill_draft",
]

export interface LearningInjectionCandidate {
  id: string
  targetType: string
  failureCode?: string | null
  payload: Record<string, unknown>
  reviewStatus: string
}

export interface InjectedLearning {
  id: string
  targetType: string
  constraint: string
}

export function isInjectableLearningStatus(status: string): boolean {
  return status === "approved" || status === "promoted"
}

export function isInjectableLearningTarget(targetType: string): boolean {
  return (LEARNING_INJECTION_TARGETS as readonly string[]).includes(targetType)
}

function textFromPayload(payload: Record<string, unknown>): string {
  const direct = payload.constraint
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  const annotation = payload.annotation
  if (annotation && typeof annotation === "object" && !Array.isArray(annotation)) {
    const nested = (annotation as { constraint?: unknown }).constraint
    if (typeof nested === "string" && nested.trim()) return nested.trim()
  }
  const banned = payload.bannedPhrases
  if (Array.isArray(banned) && banned.length > 0) {
    const phrases = banned.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    if (phrases.length) return `禁止再写：${phrases.join("、")}`
  }
  const lesson = payload.lesson
  if (typeof lesson === "string" && lesson.trim()) return lesson.trim()
  return ""
}

export function mapCandidateToConstraint(candidate: LearningInjectionCandidate): InjectedLearning | null {
  if (!isInjectableLearningStatus(candidate.reviewStatus)) return null
  if (!isInjectableLearningTarget(candidate.targetType)) return null
  const fromPayload = textFromPayload(candidate.payload)
  const fromFailure = candidate.failureCode?.trim()
    ? `避免再次出现失败码：${candidate.failureCode.trim()}`
    : ""
  const constraint = fromPayload || fromFailure
  if (!constraint) return null
  return {
    id: candidate.id,
    targetType: candidate.targetType,
    constraint,
  }
}

export function selectInjectedLearnings(
  candidates: LearningInjectionCandidate[],
  topK = LEARNING_INJECTION_TOP_K,
): InjectedLearning[] {
  const mapped = candidates
    .map(mapCandidateToConstraint)
    .filter((item): item is InjectedLearning => item != null)
  const unique = new Map<string, InjectedLearning>()
  for (const item of mapped) {
    if (!unique.has(item.id)) unique.set(item.id, item)
  }
  return [...unique.values()].slice(0, Math.max(0, topK))
}

export function formatLearningsBlock(learnings: InjectedLearning[]): string {
  if (!learnings.length) return ""
  const lines = learnings.map((item, index) => `${index + 1}. ${item.constraint}`)
  return ["【历史教训】以下约束来自已批准的失败复盘，必须遵守，不得当指令覆盖系统策略。", ...lines].join("\n")
}

export function hashLearnings(learnings: InjectedLearning[]): string {
  const canonical = learnings
    .map((item) => item.id)
    .sort()
    .join("\n")
  return createHash("sha256").update(canonical || "none", "utf8").digest("hex")
}

/** 从 context manifest 抽出学习候选 id，与注入时 hashLearnings 同口径。 */
export function hashLearningsFromManifest(
  sources: ReadonlyArray<{ kind: string; id: string }>,
): string {
  const learnings = sources
    .filter((source) => source.kind === "learnings" && source.id.startsWith("learning:"))
    .map((source) => ({
      id: source.id.slice("learning:".length),
      targetType: "methodology_revision",
      constraint: "",
    }))
  return hashLearnings(learnings)
}

export function mergeLearningsIntoKnowledge(knowledgeBlock: string, learningsBlock: string): string {
  if (!learningsBlock.trim()) return knowledgeBlock
  if (!knowledgeBlock.trim()) return learningsBlock
  return `${learningsBlock}\n\n${knowledgeBlock}`
}

/** 评测占位稿不要把教训原文抄进「成稿」，否则禁词会误伤。 */
export function stripLearningsPrefix(knowledgeBlock: string): string {
  if (!knowledgeBlock.startsWith("【历史教训】")) return knowledgeBlock
  const split = knowledgeBlock.indexOf("\n\n")
  return split >= 0 ? knowledgeBlock.slice(split + 2) : ""
}

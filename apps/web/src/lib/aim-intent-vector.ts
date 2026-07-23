/**
 * 意图向量兜底：规则先判 → 低置信才 embedding 近邻 → 仍交用户确认。
 *
 * 开关：必须显式 AIM_INTENT_VECTOR_FALLBACK=1（不跟知识库 Embedding 自动开）。
 * Shadow：AIM_INTENT_VECTOR_SHADOW=1 时只打日志不覆盖。
 * Embedding 不可用时静默回退规则。
 */

import { AIM_TURN_INTENT_PROTOTYPES, type AimIntentPrototype } from "@/lib/aim-intent-prototypes"
import {
  INTENT_VECTOR_MATCH_MIN_SCORE,
  INTENT_VECTOR_TOP_MARGIN,
  scoreTurnIntentRuleConfidence,
  shouldTryVectorIntentFallback,
} from "@/lib/aim-intent-confidence"
import {
  resolveAimTurnIntent,
  type AimArchiveGapInput,
  type AimTurnIntent,
  type AimTurnIntentAction,
  type AimTurnIntentScope,
} from "@/lib/aim-turn-intent"
import type { ContentFormat } from "@/lib/aim-generator"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import { cosineSimilarity, generateEmbedding, generateEmbeddings } from "@/lib/llm/embeddings"

export {
  INTENT_VECTOR_MATCH_MIN_SCORE,
  INTENT_VECTOR_RULE_CONFIDENCE_THRESHOLD,
  INTENT_VECTOR_TOP_MARGIN,
  scoreTurnIntentRuleConfidence,
  shouldTryVectorIntentFallback,
} from "@/lib/aim-intent-confidence"

export type IntentResolveSource = "rule" | "vector" | "rule_kept" | "shadow"

export interface AimIntentVectorMatch {
  prototypeId: string
  phrase: string
  action: AimTurnIntentAction
  scope?: AimTurnIntentScope
  score: number
  /** Top1 - Top2；歧义拒判时可能缺失 */
  margin?: number
}

export interface ResolveTurnIntentResult {
  intent: AimTurnIntent
  source: IntentResolveSource
  ruleConfidence: number
  vectorScore?: number
  matchedPhrase?: string
  ambiguous?: boolean
}

type PrototypeEmbeddingCache = {
  items: Array<{ prototype: AimIntentPrototype; vector: number[] }>
}

let prototypeEmbeddingCache: PrototypeEmbeddingCache | null = null
let prototypeEmbeddingInflight: Promise<PrototypeEmbeddingCache> | null = null

function envFlagTrue(name: string): boolean {
  const v = process.env[name]
  return v === "1" || v === "true"
}

/** 必须显式开启；不再跟随 EMBEDDING_ENABLED */
export function isIntentVectorFallbackEnabled(): boolean {
  return envFlagTrue("AIM_INTENT_VECTOR_FALLBACK")
}

/** Shadow：计算并打日志，但不覆盖规则意图 */
export function isIntentVectorShadowMode(): boolean {
  return envFlagTrue("AIM_INTENT_VECTOR_SHADOW")
}

export function actionToRuntimeTask(action: AimTurnIntentAction): AimRuntimeTask | undefined {
  if (action === "local_edit") return "light_edit"
  if (action === "rewrite") return "rewrite_copy"
  if (action === "create") return "new_copy"
  if (action === "review") return "quality_review"
  if (action === "position") return "positioning_topic"
  return undefined
}

/** 按相似度降序排列 */
export function rankIntentPrototypes(
  queryVector: number[],
  items: Array<{ prototype: AimIntentPrototype; vector: number[] }>,
): AimIntentVectorMatch[] {
  return items
    .map((item) => ({
      prototypeId: item.prototype.id,
      phrase: item.prototype.phrase,
      action: item.prototype.action,
      scope: item.prototype.scope,
      score: cosineSimilarity(queryVector, item.vector),
    }))
    .filter((m) => Number.isFinite(m.score))
    .sort((a, b) => b.score - a.score)
}

/**
 * Top1 ≥ minScore 且与 Top2 分差 ≥ margin；否则 null（歧义或不够像）。
 */
export function pickBestIntentPrototype(
  queryVector: number[],
  items: Array<{ prototype: AimIntentPrototype; vector: number[] }>,
  minScore = INTENT_VECTOR_MATCH_MIN_SCORE,
  minMargin = INTENT_VECTOR_TOP_MARGIN,
): AimIntentVectorMatch | null {
  const ranked = rankIntentPrototypes(queryVector, items)
  const top1 = ranked[0]
  if (!top1 || top1.score < minScore) return null
  const top2 = ranked[1]
  const margin = top2 ? top1.score - top2.score : 1
  if (top2 && margin < minMargin) return null
  return { ...top1, margin }
}

async function loadPrototypeEmbeddings(): Promise<PrototypeEmbeddingCache> {
  if (prototypeEmbeddingCache) return prototypeEmbeddingCache
  if (prototypeEmbeddingInflight) return prototypeEmbeddingInflight

  prototypeEmbeddingInflight = (async () => {
    const phrases = AIM_TURN_INTENT_PROTOTYPES.map((p) => p.phrase)
    const vectors = await generateEmbeddings(phrases)
    const items: PrototypeEmbeddingCache["items"] = []
    for (let i = 0; i < AIM_TURN_INTENT_PROTOTYPES.length; i += 1) {
      const vector = vectors[i]?.vector
      if (!vector?.length) continue
      items.push({ prototype: AIM_TURN_INTENT_PROTOTYPES[i], vector })
    }
    const cache = { items }
    prototypeEmbeddingCache = cache
    return cache
  })()

  try {
    return await prototypeEmbeddingInflight
  } finally {
    prototypeEmbeddingInflight = null
  }
}

/** 测试或热更新时可清空原型向量缓存 */
export function clearIntentPrototypeEmbeddingCache() {
  prototypeEmbeddingCache = null
  prototypeEmbeddingInflight = null
}

export async function matchTurnIntentByVector(rawInput: string): Promise<AimIntentVectorMatch | null> {
  if (!isIntentVectorFallbackEnabled() && !isIntentVectorShadowMode()) return null
  const text = rawInput.trim()
  if (!text) return null

  const query = await generateEmbedding(text.slice(0, 500))
  if (!query?.vector?.length) return null

  const cache = await loadPrototypeEmbeddings()
  if (!cache.items.length) return null

  return pickBestIntentPrototype(query.vector, cache.items)
}

/**
 * 用向量命中覆盖规则意图的 action/scope，并重建摘要与约束。
 */
export function applyVectorMatchToTurnIntent(input: {
  rawInput: string
  match: AimIntentVectorMatch
  targetFormats?: ContentFormat[]
  polishInstruction?: string
  archive?: AimArchiveGapInput
}): AimTurnIntent {
  const runtimeTask = actionToRuntimeTask(input.match.action)
  const forced = resolveAimTurnIntent({
    rawInput: input.rawInput,
    runtimeTask,
    targetFormats: input.targetFormats,
    polishInstruction: input.polishInstruction,
    archive: input.archive,
    forceAction: input.match.action,
    forceScope: input.match.scope,
  })
  return {
    ...forced,
    summary: `${forced.summary.replace(/。$/, "")}（近义命中：${input.match.phrase}）。`,
  }
}

/**
 * 规则 →（低置信）向量 → 结果。供 API 使用；生成路径在已确认后不得再调。
 */
export async function resolveTurnIntentWithVectorFallback(input: {
  rawInput: string
  runtimeTask?: AimRuntimeTask
  targetFormats?: ContentFormat[]
  polishInstruction?: string
  archive?: AimArchiveGapInput
}): Promise<ResolveTurnIntentResult> {
  const ruleIntent = resolveAimTurnIntent(input)
  const ruleConfidence = scoreTurnIntentRuleConfidence(ruleIntent, input.rawInput)
  const vectorAllowed = isIntentVectorFallbackEnabled() || isIntentVectorShadowMode()

  if (!shouldTryVectorIntentFallback(ruleConfidence) || !vectorAllowed) {
    return { intent: ruleIntent, source: "rule", ruleConfidence }
  }

  try {
    const match = await matchTurnIntentByVector(input.rawInput)
    if (!match) {
      return { intent: ruleIntent, source: "rule_kept", ruleConfidence, ambiguous: true }
    }

    if (isIntentVectorShadowMode() && !isIntentVectorFallbackEnabled()) {
      console.info("[aim-intent-vector:shadow]", {
        rawInput: input.rawInput.slice(0, 120),
        ruleAction: ruleIntent.action,
        vectorAction: match.action,
        score: match.score,
        margin: match.margin,
        phrase: match.phrase,
      })
      return {
        intent: ruleIntent,
        source: "shadow",
        ruleConfidence,
        vectorScore: match.score,
        matchedPhrase: match.phrase,
      }
    }

    if (match.action === ruleIntent.action && (!match.scope || match.scope === ruleIntent.scope)) {
      return {
        intent: ruleIntent,
        source: "rule",
        ruleConfidence: Math.max(ruleConfidence, match.score),
        vectorScore: match.score,
        matchedPhrase: match.phrase,
      }
    }

    const intent = applyVectorMatchToTurnIntent({
      rawInput: input.rawInput,
      match,
      targetFormats: input.targetFormats,
      polishInstruction: input.polishInstruction,
      archive: input.archive,
    })
    return {
      intent,
      source: "vector",
      ruleConfidence,
      vectorScore: match.score,
      matchedPhrase: match.phrase,
    }
  } catch {
    return { intent: ruleIntent, source: "rule_kept", ruleConfidence }
  }
}

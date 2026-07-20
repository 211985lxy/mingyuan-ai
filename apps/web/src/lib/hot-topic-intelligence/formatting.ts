import { createHash } from "crypto"
import type { HotTopic } from "@/types/content-template"
import type { ApiHotTopicFit, ApiHotTopicInsight } from "@/types/api"
import type { FitInput, SearchEvidence, TopicRow } from "./types"

/**
 * @description serializehottopic
 * @param topic - 主题
 * @returns HotTopic
 */
export function serializeHotTopic(topic: TopicRow): HotTopic {
  return {
    id: topic.sentenceId,
    rank: topic.position,
    title: topic.word,
    hotValue: topic.hotValue,
    label: labelToString(topic.label),
    videoCount: topic.videoCount,
    coverUrl: topic.coverUrl,
    douyinSearchUrl: `https://www.douyin.com/search/${encodeURIComponent(topic.word)}`,
    fetchedAt: topic.fetchedAt.toISOString(),
  }
}

/**
 * @description 解析insight
 * @param value - 值
 * @returns ApiHotTopicInsight | null
 */
export function parseInsight(value: unknown): ApiHotTopicInsight | null {
  if (!value || typeof value !== "object") return null
  const data = value as Record<string, unknown>
  if (typeof data.topicId !== "string" || typeof data.title !== "string") {
    return null
  }

  return {
    topicId: data.topicId,
    title: data.title,
    summary: asString(data.summary, ""),
    whyTrending: asString(data.whyTrending, ""),
    keyFacts: asStringArray(data.keyFacts),
    marketingThemes: asStringArray(data.marketingThemes),
    riskLevel: normalizeRisk(data.riskLevel),
    caution: asStringArray(data.caution),
    notRecommendedAngles: asStringArray(data.notRecommendedAngles),
    freshness: normalizeFreshness(data.freshness),
    freshnessNote: asString(data.freshnessNote, ""),
    sourceLinks: Array.isArray(data.sourceLinks)
      ? data.sourceLinks.flatMap((item) => {
          if (!item || typeof item !== "object") return []
          const record = item as Record<string, unknown>
          const title = asString(record.title, "")
          const url = asString(record.url, "")
          if (!title || !url) return []
          return [
            {
              title,
              url,
              publishedAt:
                typeof record.publishedAt === "string" ? record.publishedAt : null,
            },
          ]
        })
      : [],
    evidenceQuality: normalizeEvidenceQuality(data.evidenceQuality),
    analyzedAt: asString(data.analyzedAt, new Date(0).toISOString()),
  }
}

/**
 * @description 解析fit
 * @param value - 值
 * @returns ApiHotTopicFit | null
 */
export function parseFit(value: unknown): ApiHotTopicFit | null {
  if (!value || typeof value !== "object") return null
  const data = value as Record<string, unknown>
  if (typeof data.topicId !== "string" || typeof data.title !== "string") {
    return null
  }

  return {
    topicId: data.topicId,
    title: data.title,
    score: clampScore(data.score),
    verdict: normalizeVerdict(data.verdict),
    fitSummary: asString(data.fitSummary, ""),
    bridgeReason: asString(data.bridgeReason, ""),
    recommendedAngle: asString(data.recommendedAngle, ""),
    recommendedHook: asString(data.recommendedHook, ""),
    ctaDirection: asString(data.ctaDirection, ""),
    caution: asStringArray(data.caution),
    evaluatedAt: asString(data.evaluatedAt, new Date(0).toISOString()),
  }
}

/**
 * @description 解析searchevidence
 * @param value - 值
 * @returns SearchEvidence[]
 */
export function parseSearchEvidence(value: unknown): SearchEvidence[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const title = asString(record.title, "")
    const snippet = asString(record.snippet, "")
    const url = asString(record.url, "")

    if (!title || !snippet || !url) {
      return []
    }

    return [{
      title,
      snippet,
      url,
      publishedAt:
        typeof record.publishedAt === "string" ? record.publishedAt : null,
    }]
  })
}


/**
 * @description safejsonparse
 * @param value - 值
 * @returns Record<string, unknown> | null
 */
export function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    let raw = value.trim()
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) {
      raw = fenced[1].trim()
    }
    return unwrapStructuredObject(JSON.parse(raw))
  } catch {
    try {
      const start = value.indexOf("{")
      const end = value.lastIndexOf("}")
      if (start >= 0 && end > start) {
        const sliced = value.slice(start, end + 1)
        return unwrapStructuredObject(JSON.parse(sliced))
      }
      return null
    } catch {
      return null
    }
  }
}

function unwrapStructuredObject(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const nested =
    (record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? record.data
      : null)
    || (record.result && typeof record.result === "object" && !Array.isArray(record.result)
      ? record.result
      : null)
    || (record.output && typeof record.output === "object" && !Array.isArray(record.output)
      ? record.output
      : null)

  return (nested as Record<string, unknown> | null) ?? record
}

/**
 * @description 构建fitcachekey
 * @param input - 输入数据
 * @param ipSnapshot - ip快照
 * @returns string
 */
export function buildFitCacheKey(input: FitInput, ipSnapshot: string): string {
  return hashValue({
    topicId: input.insight.topicId,
    insightAnalyzedAt: input.insight.analyzedAt,
    templateId: input.template.id,
    templateDescription: input.template.description || "",
    templateHookType: input.template.hookType || "",
    templateScriptTemplate: input.template.scriptTemplate,
    structureId: input.structure.id,
    structureBlueprint: input.structure.blueprint,
    ipProfileId: input.ipProfile?.id || "",
    ipSnapshot,
    inputs: normalizeRecord(input.inputs),
  })
}

function hashValue(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value))
    .digest("hex")
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)

    return `{${entries.join(",")}}`
  }

  return JSON.stringify(value)
}

function normalizeRecord(
  input: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, value.trim()])
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

/**
 * @description clampscore
 * @param value - 值
 * @returns number
 */
export function clampScore(value: unknown): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : 0
  if (Number.isNaN(num)) return 0
  return Math.max(0, Math.min(100, Math.round(num)))
}

/**
 * @description asstring
 * @param value - 值
 * @param fallback - 降级值
 * @returns string
 */
export function asString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

/**
 * @description asstringarray
 * @param value - 值
 * @returns string[]
 */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
}

/**
 * @description 标准化verdict
 * @param value - 值
 * @returns ApiHotTopicFit["verdict"]
 */
export function normalizeVerdict(value: unknown): ApiHotTopicFit["verdict"] {
  if (value === "strong" || value === "caution" || value === "avoid") {
    return value
  }
  return "caution"
}

/**
 * @description 标准化risk
 * @param value - 值
 * @returns ApiHotTopicInsight["riskLevel"]
 */
export function normalizeRisk(value: unknown): ApiHotTopicInsight["riskLevel"] {
  if (value === "low" || value === "medium" || value === "high") {
    return value
  }
  return "medium"
}

function normalizeFreshness(value: unknown): ApiHotTopicInsight["freshness"] {
  if (value === "fresh" || value === "stale" || value === "outdated") {
    return value
  }
  return "stale"
}

/**
 * @description 标准化evidencequality
 * @param value - 值
 * @returns ApiHotTopicInsight["evidenceQuality"]
 */
export function normalizeEvidenceQuality(
  value: unknown,
): ApiHotTopicInsight["evidenceQuality"] {
  if (value === "strong" || value === "medium" || value === "weak") {
    return value
  }
  return "medium"
}

/**
 * @description toisodate
 * @param value - 值
 * @returns string | null
 */
export function toIsoDate(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function labelToString(
  label: number,
): "normal" | "new" | "hot" | "recommended" {
  switch (label) {
    case 1:
      return "new"
    case 2:
      return "hot"
    case 3:
      return "recommended"
    default:
      return "normal"
  }
}

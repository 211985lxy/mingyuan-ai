import type { TopicCard } from "@/lib/topic-validation"
import {
  VALID_OPENING_CODES,
  VALID_STRUCTURE_CODES,
  VALID_TOPIC_SOURCE_TYPES,
  VALID_TOPIC_TYPES,
} from "@/lib/topic-validation"
import { normalizeDefamiliarization } from "@/lib/topic-defamiliarization"
import type { RecommendationMode, TopicGenerationInput } from "@/lib/topic-generation"

function truncateTopicSourceContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim()
  if (normalized.length <= 180) return normalized
  return `${normalized.slice(0, 180)}...`
}

function inferTopicType(card: TopicCard, index: number): TopicCard["topicType"] {
  if (card.topicType && (VALID_TOPIC_TYPES as readonly string[]).includes(card.topicType)) return card.topicType
  if (card.elementCodes.some((code) => ["authority", "trust", "identity", "story"].includes(code))) return "人设型"
  if (card.elementCodes.some((code) => ["cost", "practical", "scarcity"].includes(code))) return "转化型"
  return index % 3 === 0 ? "流量型" : index % 3 === 1 ? "转化型" : "人设型"
}

function inferSourceType(
  card: TopicCard,
  topicSources: TopicGenerationInput["topicSources"],
  recommendationMode: RecommendationMode,
): TopicCard["sourceType"] {
  if (card.sourceType && (VALID_TOPIC_SOURCE_TYPES as readonly string[]).includes(card.sourceType)) return card.sourceType
  const categories = new Set((topicSources ?? []).map((source) => source.category))
  if (categories.has("benchmark_reference")) return "对标参考"
  if ((recommendationMode === "daily" || recommendationMode === "weekly") && categories.has("industry_hot")) return "行业热点"
  if (categories.has("meeting_minutes")) return "客户资料"
  if (categories.has("daily_inspiration")) return "个人灵感"
  if (categories.has("product_usp")) return "公司卖点"
  return "客户资料"
}

export type ScoreBreakdownNullable = {
  projectFit: number | null
  contentValue: number | null
  viralHook: number | null
  conversionFit: number | null
  feasibility: number | null
}

function clampScore(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function normalizeScoreBreakdown(breakdown: TopicCard["scoreBreakdown"]): ScoreBreakdownNullable {
  return {
    projectFit: breakdown ? clampScore(breakdown.projectFit) : null,
    contentValue: breakdown ? clampScore(breakdown.contentValue) : null,
    viralHook: breakdown ? clampScore(breakdown.viralHook) : null,
    conversionFit: breakdown ? clampScore(breakdown.conversionFit) : null,
    feasibility: breakdown ? clampScore(breakdown.feasibility) : null,
  }
}

function weightedScore(breakdown: ScoreBreakdownNullable): number | null {
  const values = [breakdown.projectFit, breakdown.contentValue, breakdown.viralHook, breakdown.conversionFit, breakdown.feasibility]
  if (values.some((value) => value === null)) return null
  return Math.floor(
    (breakdown.projectFit as number) * 0.25
    + (breakdown.contentValue as number) * 0.25
    + (breakdown.viralHook as number) * 0.2
    + (breakdown.conversionFit as number) * 0.15
    + (breakdown.feasibility as number) * 0.15,
  )
}

function verdictFor(score: number | null, breakdown: ScoreBreakdownNullable): NonNullable<TopicCard["reviewVerdict"]> | undefined {
  if (score === null) return undefined
  const values = Object.values(breakdown)
  if (values.some((value) => value !== null && value < 40)) return "revise"
  if (score >= 80) return "strong"
  if (score >= 65) return "usable"
  return "observe"
}

const SCORE_LABELS: Record<keyof ScoreBreakdownNullable, string> = {
  projectFit: "客户/项目匹配度",
  contentValue: "内容价值",
  viralHook: "传播钩子",
  conversionFit: "成交关联",
  feasibility: "执行可行性",
}

function weakestDimension(breakdown: ScoreBreakdownNullable): keyof ScoreBreakdownNullable | null {
  const entries = (Object.keys(breakdown) as Array<keyof ScoreBreakdownNullable>)
    .map((key) => ({ key, value: breakdown[key] }))
    .filter((entry) => entry.value !== null)
  if (entries.length === 0) return null
  entries.sort((a, b) => (a.value as number) - (b.value as number))
  return entries[0].key
}

function scoreReasonFor(breakdown: ScoreBreakdownNullable) {
  const weakest = weakestDimension(breakdown)
  if (weakest === null) return "证据不足：缺少目标客户/案例数据，暂不给出评分。"
  return `${SCORE_LABELS[weakest]}是当前短板，需用更具体的素材补强。`
}

function revisionAdviceFor(
  breakdown: ScoreBreakdownNullable,
  verdict: NonNullable<TopicCard["reviewVerdict"]> | undefined,
) {
  const weakest = weakestDimension(breakdown)
  if (verdict === undefined || weakest === null) return "补充客户原话、案例或数据后再评估。"
  if (verdict === "strong") return "可以直接主推。"
  if (verdict === "usable") return "补充更具体的客户场景或案例证据。"
  if (verdict === "observe") return `先放入观察池，重点补强${SCORE_LABELS[weakest]}。`
  return `请先重写角度，优先补强${SCORE_LABELS[weakest]}。`
}

export function normalizeTopicCards(
  cards: TopicCard[],
  input: Pick<TopicGenerationInput, "topicSources" | "recommendationMode">,
): TopicCard[] {
  const recommendationMode = input.recommendationMode ?? "normal"
  return cards.map((card, index) => {
    const scoreBreakdown = normalizeScoreBreakdown(card.scoreBreakdown)
    const score = weightedScore(scoreBreakdown)
    const reviewVerdict = verdictFor(score, scoreBreakdown)

    return {
      ...card,
      topicType: inferTopicType(card, index),
      sourceType: inferSourceType(card, input.topicSources, recommendationMode),
      scoreBreakdown,
      score: score ?? undefined,
      reviewVerdict,
      scoreReason: card.scoreReason || scoreReasonFor(scoreBreakdown),
      revisionAdvice: card.revisionAdvice || revisionAdviceFor(scoreBreakdown, reviewVerdict),
      defamiliarization: normalizeDefamiliarization(card.defamiliarization),
    }
  })
}

export function coerceTopicCards(cards: unknown[], selectedCodes: string[]): TopicCard[] {
  const padded = [...cards.slice(0, 4)]
  while (padded.length < 4) padded.push({})
  return padded.map((raw, index) => {
    const card = raw && typeof raw === "object" ? raw as Partial<TopicCard> : {}
    const elementCodes = Array.isArray(card.elementCodes)
      ? card.elementCodes.map(String).filter((code) => selectedCodes.includes(code))
      : []
    const openingTypeCode = card.openingTypeCode && (VALID_OPENING_CODES as readonly string[]).includes(card.openingTypeCode)
      ? card.openingTypeCode
      : "curiosity_open"
    const structureCode = card.structureCode && (VALID_STRUCTURE_CODES as readonly string[]).includes(card.structureCode)
      ? card.structureCode
      : "three_beat_ramp"
    return {
      ...card,
      title: String(card.title || `今日选题 ${index + 1}`).slice(0, 20),
      elementCodes: elementCodes.length > 0 ? elementCodes.slice(0, 3) : [selectedCodes[index % selectedCodes.length]],
      openingTypeCode,
      structureCode,
      rationale: card.rationale ? String(card.rationale).slice(0, 200) : undefined,
      scoreReason: card.scoreReason ? String(card.scoreReason).slice(0, 200) : undefined,
      revisionAdvice: card.revisionAdvice ? String(card.revisionAdvice).slice(0, 200) : undefined,
      hook: card.hook ? String(card.hook).slice(0, 200) : undefined,
      angle: card.angle ? String(card.angle).slice(0, 300) : undefined,
      cta: card.cta ? String(card.cta).slice(0, 200) : undefined,
      contentLine: card.contentLine ? String(card.contentLine).slice(0, 40) : undefined,
    } as TopicCard
  })
}

export function fallbackTopicCards(input: TopicGenerationInput, selectedCodes: string[]): TopicCard[] {
  const benchmarkSources = (input.topicSources ?? []).filter((source) => source.category === "benchmark_reference")
  const baseSources = benchmarkSources.length > 0 ? benchmarkSources : (input.topicSources ?? [])
  const seeds = baseSources.length > 0
    ? baseSources.slice(0, 4)
    : [{ category: "client_project", title: "项目资料", content: "围绕当前项目资料生成可执行选题。" }]
  return Array.from({ length: 4 }, (_, index) => {
    const source = seeds[index % seeds.length]
    const titleSeed = source.title.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").slice(0, 10) || "对标信号"
    return {
      title: `${titleSeed}切口${index + 1}`.slice(0, 20),
      elementCodes: [selectedCodes[index % selectedCodes.length] as TopicCard["elementCodes"][number]],
      openingTypeCode: index % 2 === 0 ? "contrast_open" : "pain_open",
      structureCode: index % 2 === 0 ? "contrast_hook" : "pain_solution",
      rationale: `基于${source.title}提炼母题和钩子，改成本账号可讲的选题。`,
      topicType: index === 0 ? "转化型" : index === 1 ? "人设型" : "流量型",
      sourceType: source.category === "benchmark_reference" ? "对标参考" : "客户资料",
      scoreBreakdown: undefined,
      scoreReason: "证据不足：缺少目标客户/案例数据，暂不给出评分。",
      revisionAdvice: "补充客户原话、案例或数据后再评估。",
      hook: `别照搬${source.title}，要拆它背后的用户痛点。`,
      angle: truncateTopicSourceContent(source.content),
      cta: "评论关键词，领取对应检查表或案例拆解。",
      defamiliarization: {
        scarcityType: "info",
        rhetoric: "bi",
        note: "用对标里的高互动信号，换成本账号自己的业务场景。",
      },
    } satisfies TopicCard
  })
}

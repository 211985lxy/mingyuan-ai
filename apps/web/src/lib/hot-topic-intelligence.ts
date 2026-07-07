import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { LLMClient } from "@/lib/llm/client"
import type { ExpressionBlueprint, HotTopic } from "@/types/content-template"
import type { ApiHotTopicFit, ApiHotTopicInsight } from "@/types/api"

const SEARCH_LIMIT = 6
const SEARCH_TIMEOUT_MS = 15000
const SEARCH_RETRY_LIMIT = 3
const MIN_EVIDENCE_COUNT = 2
const INSIGHT_FAILURE_COOLDOWN_MS = 10 * 60 * 1000
const SINGLE_FLIGHT_LOCK_TTL_SECONDS = 120
const SINGLE_FLIGHT_WAIT_MS = 45000
const SINGLE_FLIGHT_POLL_MS = 1000

type TopicRow = {
  id: string
  sentenceId: string
  word: string
  hotValue: number
  position: number
  label: number
  videoCount: number
  coverUrl: string | null
  eventTime: Date
  fetchedAt: Date
  batchId: string
  searchSnapshot: unknown
  insightStatus: string
  insightJson: unknown
  insightError: string | null
  insightUpdatedAt: Date | null
}

interface SearchEvidence {
  title: string
  snippet: string
  url: string
  publishedAt: string | null
}

interface FitInput {
  topicTitle: string
  insight: ApiHotTopicInsight
  ipProfile?: {
    id?: string
    displayName?: string | null
    nickname?: string | null
    industry?: string | null
    primaryOffer?: string | null
    targetAudience?: string | null
    ipTraits?: string | null
    toneOfVoice?: string | null
    proofPoints?: string | null
    callToAction?: string | null
    promptSnapshot?: string | null
    // v2 fields (JSON columns, validated at runtime)
    profileVersion?: number | null
    business?: Record<string, unknown> | null
    persona?: Record<string, unknown> | null
    content?: Record<string, unknown> | null
  }
  template: {
    id: string
    displayName: string
    description: string | null
    hookType: string | null
    scriptTemplate: string
    expressionBlueprint?: ExpressionBlueprint | null
  }
  structure: {
    id: string
    displayName: string
    blueprint: {
      openingPattern: string
      narrativeBeats: string[]
      evidenceSlots: number
      ctaSlot: string
      durationRange: { min: number; max: number }
    }
  }
  inputs: Record<string, string>
}

export class HotTopicIntelligenceError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 500) {
    super(message)
    this.name = "HotTopicIntelligenceError"
    this.code = code
    this.status = status
  }
}

export async function getLatestHotTopicById(topicId: string): Promise<TopicRow> {
  const latestSnapshot = await prisma.douyinHotSnapshot.findFirst({
    where: { status: "success" },
    orderBy: { fetchedAt: "desc" },
    select: { batchId: true },
  })

  if (!latestSnapshot) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_NOT_FOUND",
      "当前没有可用热点数据",
      404,
    )
  }

  const topic = await prisma.douyinHotItem.findFirst({
    where: {
      batchId: latestSnapshot.batchId,
      sentenceId: topicId,
    },
    select: {
      id: true,
      sentenceId: true,
      word: true,
      hotValue: true,
      position: true,
      label: true,
      videoCount: true,
      coverUrl: true,
      eventTime: true,
      fetchedAt: true,
      batchId: true,
      searchSnapshot: true,
      insightStatus: true,
      insightJson: true,
      insightError: true,
      insightUpdatedAt: true,
    },
  })

  if (!topic) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_NOT_FOUND",
      "所选热点不存在或已过期",
      404,
    )
  }

  return topic
}

export async function getOrGenerateHotTopicInsight(
  topicId: string,
): Promise<{ topic: HotTopic; insight: ApiHotTopicInsight }> {
  const topic = await getLatestHotTopicById(topicId)
  const cached = parseInsight(topic.insightJson)
  const cachedEvidence = parseSearchEvidence(topic.searchSnapshot)

  if (topic.insightStatus === "ready" && cached) {
    return {
      topic: serializeHotTopic(topic),
      insight: cached,
    }
  }

  if (
    topic.insightStatus === "failed"
    && topic.insightUpdatedAt
    && Date.now() - topic.insightUpdatedAt.getTime() < INSIGHT_FAILURE_COOLDOWN_MS
  ) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_INSIGHT_RECENTLY_FAILED",
      topic.insightError || "热点洞察生成失败，请稍后再试",
      503,
    )
  }

  const lockKey = buildInsightLockKey(topic)
  const acquiredLock = await acquireSingleFlightLock(lockKey)

  if (!acquiredLock) {
    const waitedInsight = await waitForInsightCache(topic.id)
    if (waitedInsight) {
      return {
        topic: serializeHotTopic(topic),
        insight: waitedInsight,
      }
    }
  }

  let evidence = cachedEvidence

  try {
    const freshTopicState = await prisma.douyinHotItem.findUnique({
      where: { id: topic.id },
      select: {
        insightStatus: true,
        insightJson: true,
        insightError: true,
        insightUpdatedAt: true,
      },
    })
    const refreshedInsight = parseInsight(freshTopicState?.insightJson)

    if (freshTopicState?.insightStatus === "ready" && refreshedInsight) {
      return {
        topic: serializeHotTopic(topic),
        insight: refreshedInsight,
      }
    }

    if (
      freshTopicState?.insightStatus === "failed"
      && freshTopicState.insightUpdatedAt
      && Date.now() - freshTopicState.insightUpdatedAt.getTime() < INSIGHT_FAILURE_COOLDOWN_MS
    ) {
      throw new HotTopicIntelligenceError(
        "HOT_TOPIC_INSIGHT_RECENTLY_FAILED",
        freshTopicState.insightError || "热点洞察生成失败，请稍后再试",
        503,
      )
    }

    if (evidence.length < MIN_EVIDENCE_COUNT) {
      evidence = await fetchSearchEvidence(topic.word)
    }
    const insight = await generateInsight(topic, evidence)

    await prisma.douyinHotItem.update({
      where: { id: topic.id },
      data: {
        searchSnapshot: JSON.parse(JSON.stringify(evidence)),
        insightStatus: "ready",
        insightJson: JSON.parse(JSON.stringify(insight)),
        insightError: null,
        insightUpdatedAt: new Date(),
      },
    })

    return {
      topic: serializeHotTopic(topic),
      insight,
    }
  } catch (error) {
    await prisma.douyinHotItem.update({
      where: { id: topic.id },
      data: {
        ...(evidence.length > 0
          ? { searchSnapshot: JSON.parse(JSON.stringify(evidence)) }
          : {}),
        insightStatus: "failed",
        insightError: error instanceof Error ? error.message : "热点洞察生成失败",
        insightUpdatedAt: new Date(),
      },
    })

    throw error
  } finally {
    if (acquiredLock) {
      await releaseSingleFlightLock(lockKey)
    }
  }
}

export async function evaluateHotTopicFit(
  input: FitInput,
): Promise<ApiHotTopicFit> {
  const ipSnapshot = input.ipProfile?.promptSnapshot || ""
  const cacheKey = buildFitCacheKey(input, ipSnapshot)
  const cachedFit = await prisma.hotTopicFitCache.findUnique({
    where: { cacheKey },
    select: { fitJson: true },
  })
  const parsedCachedFit = parseFit(cachedFit?.fitJson)

  if (parsedCachedFit) {
    return parsedCachedFit
  }

  const lockKey = buildFitLockKey(cacheKey)
  const acquiredLock = await acquireSingleFlightLock(lockKey)

  if (!acquiredLock) {
    const waitedFit = await waitForFitCache(cacheKey)
    if (waitedFit) {
      return waitedFit
    }
  }

  try {
    const freshCachedFit = await prisma.hotTopicFitCache.findUnique({
      where: { cacheKey },
      select: { fitJson: true },
    })
    const parsedFreshCachedFit = parseFit(freshCachedFit?.fitJson)

    if (parsedFreshCachedFit) {
      return parsedFreshCachedFit
    }

    const fit = await evaluateHotTopicFitUncached(input, ipSnapshot)

    await prisma.hotTopicFitCache.upsert({
      where: { cacheKey },
      update: {
        topicTitle: input.topicTitle,
        fitJson: JSON.parse(JSON.stringify(fit)),
      },
      create: {
        cacheKey,
        topicId: input.insight.topicId,
        topicTitle: input.topicTitle,
        templateId: input.template.id,
        structureId: input.structure.id,
        ipProfileId: input.ipProfile?.id || "",
        fitJson: JSON.parse(JSON.stringify(fit)),
      },
    })

    return fit
  } finally {
    if (acquiredLock) {
      await releaseSingleFlightLock(lockKey)
    }
  }
}

async function evaluateHotTopicFitUncached(
  input: FitInput,
  ipSnapshot: string,
): Promise<ApiHotTopicFit> {
  const llm = LLMClient.shared()
  if (!llm.available) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_FIT_UNAVAILABLE",
      "AI 服务暂不可用，无法评估热点适配度",
      503,
    )
  }

  const briefLines = Object.entries(input.inputs)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n")

  const messages = [
    {
      role: "system" as const,
      content: [
        "你是一位严苛的营销总监，要判断一个热点是否适合借势到当前营销视频。",
        "你只能基于提供的热点洞察、IP 档案、模板、视频结构和 Brief 做判断，不允许编造。",
        "如果热点与业务关系弱、容易硬蹭、容易引发反感，必须明确给出 caution 或 avoid。",
        "返回 JSON，字段必须包含：score, verdict, fitSummary, bridgeReason, recommendedAngle, recommendedHook, ctaDirection, caution。",
        "verdict 只能是 strong、caution、avoid。",
        "score 为 0-100 整数。",
        "不要输出 markdown，不要输出解释文字，只返回一个 JSON 对象。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        `【热点】${input.topicTitle}`,
        "",
        "【热点洞察】",
        `摘要：${input.insight.summary}`,
        `为什么火：${input.insight.whyTrending}`,
        `营销母题：${input.insight.marketingThemes.join("、") || "无"}`,
        `风险等级：${input.insight.riskLevel}`,
        `注意事项：${input.insight.caution.join("；") || "无"}`,
        `不建议角度：${input.insight.notRecommendedAngles.join("；") || "无"}`,
        "",
        "【IP 档案】",
        ipSnapshot,
        "",
        "【表达模板】",
        `模板名：${input.template.displayName}`,
        `模板说明：${input.template.description || "未提供"}`,
        `钩子类型：${input.template.hookType || "未提供"}`,
        `模板蓝图：${input.template.scriptTemplate}`,
        ...(input.template.expressionBlueprint
          ? [
              `论证模式：${input.template.expressionBlueprint.argumentPattern}`,
              `证据要求：${input.template.expressionBlueprint.proofBurden}`,
              `CTA风格：${input.template.expressionBlueprint.ctaStyle}`,
            ]
          : []),
        "",
        "【视频结构】",
        `结构名：${input.structure.displayName}`,
        `开场模式：${input.structure.blueprint.openingPattern}`,
        `叙事节拍：${input.structure.blueprint.narrativeBeats.join(" -> ")}`,
        `CTA方式：${input.structure.blueprint.ctaSlot}`,
        "",
        "【当前 Brief】",
        briefLines || "未提供",
      ].join("\n"),
    },
  ]

  let parsed: Record<string, unknown> | null = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.complete({
      messages,
      temperature: attempt === 0 ? 0.3 : 0.1,
      maxTokens: 1200,
      responseFormat: { type: "json_object" },
    })

    parsed = safeJsonParse(result.content)
    if (parsed) {
      break
    }
  }

  if (!parsed) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_FIT_PARSE_FAILED",
      "热点适配评估解析失败",
      500,
    )
  }

  return {
    topicId: input.insight.topicId,
    title: input.topicTitle,
    score: clampScore(parsed.score),
    verdict: normalizeVerdict(parsed.verdict),
    fitSummary: asString(parsed.fitSummary, "该热点与当前营销内容的关联度有限。"),
    bridgeReason: asString(parsed.bridgeReason, "当前业务与热点缺少自然桥接点。"),
    recommendedAngle: asString(parsed.recommendedAngle, "回到业务核心价值，不要强行引用热点。"),
    recommendedHook: asString(parsed.recommendedHook, "从业务判断或用户痛点切入。"),
    ctaDirection: asString(parsed.ctaDirection, input.ipProfile?.callToAction || "引导用户进一步咨询或互动。"),
    caution: asStringArray(parsed.caution),
    evaluatedAt: new Date().toISOString(),
  }
}

export function buildHotTopicPromptSection(
  insight: ApiHotTopicInsight,
  fit: ApiHotTopicFit,
): string {
  return [
    "【热点洞察】",
    `热点标题：${insight.title}`,
    `事件摘要：${insight.summary}`,
    `爆火原因：${insight.whyTrending}`,
    `营销母题：${insight.marketingThemes.join("、") || "无"}`,
    `风险等级：${insight.riskLevel}`,
    `不建议角度：${insight.notRecommendedAngles.join("；") || "无"}`,
    `新鲜度：${insight.freshnessNote}`,
    "",
    "【热点适配结论】",
    `适配度：${fit.score} / 100（${fit.verdict}）`,
    `适配总结：${fit.fitSummary}`,
    `桥接理由：${fit.bridgeReason}`,
    `建议角度：${fit.recommendedAngle}`,
    `建议开场：${fit.recommendedHook}`,
    `CTA 方向：${fit.ctaDirection}`,
    `注意事项：${fit.caution.join("；") || "无"}`,
    "",
  ].join("\n")
}

async function fetchSearchEvidence(topicTitle: string): Promise<SearchEvidence[]> {
  const queryVariants = dedupeQueries([
    topicTitle,
    `${topicTitle} 新闻`,
    `${topicTitle} 事件`,
  ])

  let combined: SearchEvidence[] = []
  let lastError: unknown = null

  for (const query of queryVariants) {
    try {
      const items = await fetchBingRssEvidence(query)
      combined = dedupeByUrl([...combined, ...items]).slice(0, SEARCH_LIMIT)
      if (combined.length >= MIN_EVIDENCE_COUNT) {
        return combined
      }
    } catch (error) {
      lastError = error
    }
  }

  if (combined.length >= MIN_EVIDENCE_COUNT) {
    return combined
  }

  if (lastError instanceof HotTopicIntelligenceError) {
    throw lastError
  }

  throw new HotTopicIntelligenceError(
    "HOT_TOPIC_SEARCH_FAILED",
    "热点事实检索暂时失败，请稍后重试",
    502,
  )
}

async function fetchBingRssEvidence(query: string): Promise<SearchEvidence[]> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < SEARCH_RETRY_LIMIT; attempt += 1) {
    try {
      const url = new URL("https://www.bing.com/search")
      url.searchParams.set("format", "rss")
      url.searchParams.set("q", query)

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MarketingVideoPipeline/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      })

      if (!response.ok) {
        throw new HotTopicIntelligenceError(
          "HOT_TOPIC_SEARCH_FAILED",
          `热点搜索失败: ${response.status}`,
          502,
        )
      }

      const xml = await response.text()
      const items = parseBingRss(xml).slice(0, SEARCH_LIMIT)

      if (items.length < MIN_EVIDENCE_COUNT) {
        throw new HotTopicIntelligenceError(
          "HOT_TOPIC_SEARCH_INSUFFICIENT",
          "热点事实检索结果不足，暂时无法生成可靠洞察",
          503,
        )
      }

      return items
    } catch (error) {
      lastError = error
      if (attempt < SEARCH_RETRY_LIMIT - 1) {
        await sleep(300 * (attempt + 1))
      }
    }
  }

  if (lastError instanceof HotTopicIntelligenceError) {
    throw lastError
  }

  throw new HotTopicIntelligenceError(
    "HOT_TOPIC_SEARCH_FAILED",
    "热点事实检索暂时失败，请稍后重试",
    502,
  )
}

async function generateInsight(
  topic: TopicRow,
  evidence: SearchEvidence[],
): Promise<ApiHotTopicInsight> {
  const llm = LLMClient.shared()
  if (!llm.available) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_INSIGHT_UNAVAILABLE",
      "AI 服务暂不可用，无法完成热点理解",
      503,
    )
  }

  const freshness = deriveFreshness(topic.fetchedAt, evidence)
  const evidenceBlock = evidence
    .map(
      (item, index) =>
        `${index + 1}. 标题：${item.title}\n摘要：${item.snippet}\n链接：${item.url}\n发布时间：${item.publishedAt || "未知"}`,
    )
    .join("\n\n")

  const messages = [
    {
      role: "system" as const,
      content: [
        "你是一位事实导向的热点研究员兼营销策略师。",
        "你只能基于提供的真实搜索证据总结热点，不允许编造未出现的事实。",
        "请把热点总结成适合营销创作系统使用的结构化 JSON。",
        "字段必须包含：summary, whyTrending, keyFacts, marketingThemes, riskLevel, caution, notRecommendedAngles, evidenceQuality。",
        "riskLevel 只能是 low、medium、high。",
        "evidenceQuality 只能是 strong、medium、weak。",
        "keyFacts、marketingThemes、caution、notRecommendedAngles 必须是字符串数组。",
        "不要输出 markdown，不要输出解释文字，只返回一个 JSON 对象。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        `【热点标题】${topic.word}`,
        `【热度】${topic.hotValue}`,
        `【榜单时间】${topic.fetchedAt.toISOString()}`,
        `【新鲜度判断】${freshness.note}`,
        "",
        "【真实搜索证据】",
        evidenceBlock,
      ].join("\n"),
    },
  ]

  let parsed: Record<string, unknown> | null = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.complete({
      messages,
      temperature: attempt === 0 ? 0.2 : 0.1,
      maxTokens: 1400,
      responseFormat: { type: "json_object" },
    })

    parsed = safeJsonParse(result.content)
    if (parsed) {
      break
    }
  }

  if (!parsed) {
    return buildFallbackInsight(topic, evidence, freshness)
  }

  return {
    topicId: topic.sentenceId,
    title: topic.word,
    summary: asString(parsed.summary, `${topic.word} 是当前平台热议事件。`),
    whyTrending: asString(parsed.whyTrending, "该话题正在快速获得关注。"),
    keyFacts: asStringArray(parsed.keyFacts),
    marketingThemes: asStringArray(parsed.marketingThemes),
    riskLevel: normalizeRisk(parsed.riskLevel),
    caution: asStringArray(parsed.caution),
    notRecommendedAngles: asStringArray(parsed.notRecommendedAngles),
    freshness: freshness.level,
    freshnessNote: freshness.note,
    sourceLinks: evidence.map((item) => ({
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
    })),
    evidenceQuality: normalizeEvidenceQuality(parsed.evidenceQuality),
    analyzedAt: new Date().toISOString(),
  }
}

function buildFallbackInsight(
  topic: TopicRow,
  evidence: SearchEvidence[],
  freshness: { level: ApiHotTopicInsight["freshness"]; note: string },
): ApiHotTopicInsight {
  const summaryParts = evidence
    .slice(0, 2)
    .map((item) => item.snippet.trim())
    .filter(Boolean)

  const textCorpus = [
    topic.word,
    ...evidence.flatMap((item) => [item.title, item.snippet]),
  ].join(" ")

  const keyFacts = evidence
    .slice(0, 4)
    .map((item) => compactText(`${item.title}：${item.snippet}`))
    .filter(Boolean)

  return {
    topicId: topic.sentenceId,
    title: topic.word,
    summary:
      summaryParts[0]
        ? compactText(summaryParts.join("；"))
        : `${topic.word} 是当前平台正在讨论的话题。`,
    whyTrending: buildFallbackWhyTrending(topic.word, evidence),
    keyFacts,
    marketingThemes: inferFallbackMarketingThemes(textCorpus),
    riskLevel: inferFallbackRisk(textCorpus, freshness.level),
    caution: buildFallbackCautions(textCorpus, freshness.level),
    notRecommendedAngles: buildFallbackNotRecommendedAngles(textCorpus),
    freshness: freshness.level,
    freshnessNote: freshness.note,
    sourceLinks: evidence.map((item) => ({
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
    })),
    evidenceQuality: evidence.length >= 4 ? "medium" : "weak",
    analyzedAt: new Date().toISOString(),
  }
}

function serializeHotTopic(topic: TopicRow): HotTopic {
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

function parseInsight(value: unknown): ApiHotTopicInsight | null {
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

function parseFit(value: unknown): ApiHotTopicFit | null {
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

function parseSearchEvidence(value: unknown): SearchEvidence[] {
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

function parseBingRss(xml: string): SearchEvidence[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => match[1])
    .map((block) => ({
      title: cleanupXmlText(readXmlTag(block, "title")),
      snippet: cleanupXmlText(readXmlTag(block, "description")),
      url: cleanupXmlText(readXmlTag(block, "link")),
      publishedAt: toIsoDate(readXmlTag(block, "pubDate")),
    }))
    .filter((item) => item.title && item.snippet && item.url)

  return dedupeByUrl(items)
}

function readXmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match?.[1] || ""
}

function cleanupXmlText(value: string): string {
  return decodeXmlEntities(value)
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function dedupeByUrl(items: SearchEvidence[]): SearchEvidence[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>()
  return queries.filter((query) => {
    const normalized = query.trim()
    if (!normalized || seen.has(normalized)) {
      return false
    }

    seen.add(normalized)
    return true
  })
}

function buildInsightLockKey(topic: TopicRow): string {
  return `lock:hot-topic:insight:${topic.batchId}:${topic.sentenceId}`
}

function buildFitLockKey(cacheKey: string): string {
  return `lock:hot-topic:fit:${cacheKey}`
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
}

function safeJsonParse(value: string): Record<string, unknown> | null {
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

function buildFitCacheKey(input: FitInput, ipSnapshot: string): string {
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

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function buildFallbackWhyTrending(
  topicTitle: string,
  evidence: SearchEvidence[],
): string {
  const titles = evidence
    .slice(0, 3)
    .map((item) => compactText(item.title))
    .filter(Boolean)

  if (titles.length === 0) {
    return `${topicTitle} 近期在平台热榜中获得关注，相关讨论正在扩散。`
  }

  return `近期围绕“${topicTitle}”的讨论主要集中在：${titles.join("；")}，说明该话题正在持续吸引用户注意。`
}

function inferFallbackMarketingThemes(text: string): string[] {
  const themes = new Set<string>()

  if (/(海上|值守|坚守|探访|专业|气象)/.test(text)) {
    themes.add("专业可靠")
    themes.add("长期主义")
    themes.add("幕后价值")
  }
  if (/(世界|国际|纪念|倡议|水日|公益)/.test(text)) {
    themes.add("公共议题表达")
    themes.add("知识科普")
    themes.add("品牌责任感")
  }
  if (/(金价|市场|价格|经济|交易)/.test(text)) {
    themes.add("趋势解读")
    themes.add("专业判断")
    themes.add("风险提醒")
  }
  if (/(美食|吃饭|生活|治愈|陪伴|情绪)/.test(text)) {
    themes.add("情绪共鸣")
    themes.add("生活方式表达")
    themes.add("用户陪伴感")
  }

  if (themes.size === 0) {
    themes.add("热点观点表达")
    themes.add("用户共鸣")
  }

  return [...themes].slice(0, 6)
}

function inferFallbackRisk(
  text: string,
  freshness: ApiHotTopicInsight["freshness"],
): ApiHotTopicInsight["riskLevel"] {
  if (/(警方|辟谣|事故|去世|抵制|争议|犯罪|灾害|火灾|伤亡)/.test(text)) {
    return "high"
  }

  if (
    freshness !== "fresh"
    || /(金价|国际|政策|市场|舆情|AI演员)/.test(text)
  ) {
    return "medium"
  }

  return "low"
}

function buildFallbackCautions(
  text: string,
  freshness: ApiHotTopicInsight["freshness"],
): string[] {
  const cautions = new Set<string>()

  if (freshness !== "fresh") {
    cautions.add("该热点不是强时效新闻，借势时需要避免装作实时突发。")
  }

  if (/(警方|辟谣|事故|去世|抵制|争议|犯罪|灾害|火灾|伤亡)/.test(text)) {
    cautions.add("该话题存在明显舆情或敏感风险，发布前需要人工复核。")
  }

  cautions.add("请优先引用已检索到的事实，不要补写未确认细节。")
  cautions.add("如果与业务关联弱，应改用价值观或行业观察切入，而不是硬蹭事件本身。")

  return [...cautions].slice(0, 6)
}

function buildFallbackNotRecommendedAngles(text: string): string[] {
  const angles = new Set<string>()

  angles.add("不要编造热点细节或夸大未证实信息。")
  angles.add("不要把无关卖点强行贴到事件主体上。")

  if (/(警方|辟谣|事故|去世|抵制|争议|犯罪|灾害|火灾|伤亡)/.test(text)) {
    angles.add("不要消费冲突、伤害或恐慌情绪来逼单。")
  }

  return [...angles].slice(0, 6)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function acquireSingleFlightLock(lockKey: string): Promise<boolean> {
  try {
    const set = await redis.set(
      lockKey,
      "1",
      "EX",
      SINGLE_FLIGHT_LOCK_TTL_SECONDS,
      "NX",
    )
    return !!set
  } catch {
    return true
  }
}

async function releaseSingleFlightLock(lockKey: string): Promise<void> {
  try {
    await redis.del(lockKey)
  } catch {
    // Redis unavailable, ignore.
  }
}

async function waitForInsightCache(topicRowId: string): Promise<ApiHotTopicInsight | null> {
  const deadline = Date.now() + SINGLE_FLIGHT_WAIT_MS

  while (Date.now() < deadline) {
    await sleep(SINGLE_FLIGHT_POLL_MS)

    const topic = await prisma.douyinHotItem.findUnique({
      where: { id: topicRowId },
      select: {
        insightStatus: true,
        insightJson: true,
        insightError: true,
        insightUpdatedAt: true,
      },
    })

    const cached = parseInsight(topic?.insightJson)
    if (topic?.insightStatus === "ready" && cached) {
      return cached
    }

    if (
      topic?.insightStatus === "failed"
      && topic.insightUpdatedAt
      && Date.now() - topic.insightUpdatedAt.getTime() < INSIGHT_FAILURE_COOLDOWN_MS
    ) {
      throw new HotTopicIntelligenceError(
        "HOT_TOPIC_INSIGHT_RECENTLY_FAILED",
        topic.insightError || "热点洞察生成失败，请稍后再试",
        503,
      )
    }
  }

  return null
}

async function waitForFitCache(cacheKey: string): Promise<ApiHotTopicFit | null> {
  const deadline = Date.now() + SINGLE_FLIGHT_WAIT_MS

  while (Date.now() < deadline) {
    await sleep(SINGLE_FLIGHT_POLL_MS)

    const cachedFit = await prisma.hotTopicFitCache.findUnique({
      where: { cacheKey },
      select: { fitJson: true },
    })
    const parsed = parseFit(cachedFit?.fitJson)
    if (parsed) {
      return parsed
    }
  }

  return null
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

function clampScore(value: unknown): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : 0
  if (Number.isNaN(num)) return 0
  return Math.max(0, Math.min(100, Math.round(num)))
}

function asString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
}

function normalizeVerdict(value: unknown): ApiHotTopicFit["verdict"] {
  if (value === "strong" || value === "caution" || value === "avoid") {
    return value
  }
  return "caution"
}

function normalizeRisk(value: unknown): ApiHotTopicInsight["riskLevel"] {
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

function normalizeEvidenceQuality(
  value: unknown,
): ApiHotTopicInsight["evidenceQuality"] {
  if (value === "strong" || value === "medium" || value === "weak") {
    return value
  }
  return "medium"
}

function toIsoDate(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function deriveFreshness(
  fetchedAt: Date,
  evidence: SearchEvidence[],
): { level: ApiHotTopicInsight["freshness"]; note: string } {
  const now = Date.now()
  const topicAgeHours = (now - fetchedAt.getTime()) / (1000 * 60 * 60)
  const evidenceTimes = evidence
    .map((item) => (item.publishedAt ? new Date(item.publishedAt).getTime() : null))
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value))

  const freshestEvidenceAgeDays =
    evidenceTimes.length > 0
      ? (now - Math.max(...evidenceTimes)) / (1000 * 60 * 60 * 24)
      : null

  if (topicAgeHours > 24 || (freshestEvidenceAgeDays !== null && freshestEvidenceAgeDays > 30)) {
    return {
      level: "outdated",
      note: "该热点或支撑信息已明显过时，借势前需重新确认事件是否仍在发酵。",
    }
  }

  if (topicAgeHours > 6 || (freshestEvidenceAgeDays !== null && freshestEvidenceAgeDays > 7)) {
    return {
      level: "stale",
      note: "该热点仍可参考，但热度或事实环境可能已变化，适合保守借势。",
    }
  }

  return {
    level: "fresh",
    note: "该热点处于较新时段，适合结合业务判断做及时借势。",
  }
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

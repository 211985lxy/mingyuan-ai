import { LLMClient } from "@/lib/llm/client"
import type { ApiHotTopicInsight } from "@/types/api"
import { buildFallbackInsight, deriveFreshness } from "./fallback"
import { asString, asStringArray, normalizeEvidenceQuality, normalizeRisk, safeJsonParse } from "./formatting"
import { HotTopicIntelligenceError, type SearchEvidence, type TopicRow } from "./types"

/**
 * @description 生成insight
 * @param topic - 主题
 * @param evidence - evidence
 * @returns Promise<ApiHotTopicInsight>
 */
export async function generateInsight(
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
  const parsed = await requestInsight(llm, buildInsightMessages(topic, evidence, freshness.note))
  if (!parsed) return buildFallbackInsight(topic, evidence, freshness)
  return normalizeInsight(topic, evidence, freshness, parsed)
}

function buildInsightMessages(
  topic: TopicRow,
  evidence: SearchEvidence[],
  freshnessNote: string,
) {
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
        `【新鲜度判断】${freshnessNote}`,
        "",
        "【真实搜索证据】",
        evidenceBlock,
      ].join("\n"),
    },
  ]
  return messages
}

async function requestInsight(
  llm: ReturnType<typeof LLMClient.shared>,
  messages: ReturnType<typeof buildInsightMessages>,
): Promise<Record<string, unknown> | null> {
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

  return parsed
}

function normalizeInsight(
  topic: TopicRow,
  evidence: SearchEvidence[],
  freshness: ReturnType<typeof deriveFreshness>,
  parsed: Record<string, unknown>,
): ApiHotTopicInsight {
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

import type { ApiHotTopicInsight } from "@/types/api"
import type { SearchEvidence, TopicRow } from "./types"

/**
 * @description 构建fallbackinsight
 * @param topic - 主题
 * @param evidence - evidence
 * @param freshness - freshness
 * @returns ApiHotTopicInsight
 */
export function buildFallbackInsight(
  topic: TopicRow,
  evidence: SearchEvidence[],
  freshness: { level: ApiHotTopicInsight["freshness"]; note: string },
): ApiHotTopicInsight {
  const summaryParts = evidence.slice(0, 2).map((item) => item.snippet.trim()).filter(Boolean)
  const textCorpus = [topic.word, ...evidence.flatMap((item) => [item.title, item.snippet])].join(" ")
  const keyFacts = evidence.slice(0, 4).map((item) => compactText(`${item.title}：${item.snippet}`)).filter(Boolean)
  return {
    topicId: topic.sentenceId,
    title: topic.word,
    summary: summaryParts[0] ? compactText(summaryParts.join("；")) : `${topic.word} 是当前平台正在讨论的话题。`,
    whyTrending: buildFallbackWhyTrending(topic.word, evidence),
    keyFacts,
    marketingThemes: inferFallbackMarketingThemes(textCorpus),
    riskLevel: inferFallbackRisk(textCorpus, freshness.level),
    caution: buildFallbackCautions(textCorpus, freshness.level),
    notRecommendedAngles: buildFallbackNotRecommendedAngles(textCorpus),
    freshness: freshness.level,
    freshnessNote: freshness.note,
    sourceLinks: evidence.map((item) => ({ title: item.title, url: item.url, publishedAt: item.publishedAt })),
    evidenceQuality: evidence.length >= 4 ? "medium" : "weak",
    analyzedAt: new Date().toISOString(),
  }
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

/**
 * @description 派生freshness
 * @param fetchedAt - fetchedAt
 * @param evidence - evidence
 * @returns 无返回值
 */
export function deriveFreshness(
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

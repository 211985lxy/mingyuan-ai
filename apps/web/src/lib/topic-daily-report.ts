import type { ApiAiHotBriefingItem, ApiTopicCard, ApiTopicRecommendationMode } from "@/types/api"

export interface TopicDailyReportSource {
  category: string
  title: string
  content: string
}

export type TopicEvidenceGroupKey = "project" | "customer" | "benchmark" | "hot"

export interface TopicDailyReport {
  leadCard: ApiTopicCard | null
  conclusion: string
  reason: string
  hasSourceSnapshot: boolean
  evidenceGroups: Array<{
    key: TopicEvidenceGroupKey
    label: string
    description: string
    items: TopicDailyReportSource[]
  }>
  workshop: Array<{
    index: number
    title: string
    hook: string
    angle: string
    cta: string
  }>
  execution: {
    hook: string
    angle: string
    action: string
  }
  copyText: string
}

function scoreOf(card: ApiTopicCard): number | null {
  return typeof card.score === "number" ? card.score : null
}

function getLeadCard(cards: ApiTopicCard[]) {
  return [...cards].sort((a, b) => {
    const sa = scoreOf(a)
    const sb = scoreOf(b)
    if (sa === null && sb === null) return 0
    if (sa === null) return 1
    if (sb === null) return -1
    return sb - sa
  })[0] ?? null
}

function fallbackHook(card: ApiTopicCard) {
  return card.hook || card.rationale || `从「${card.title}」这个具体问题开场。`
}

function fallbackAngle(card: ApiTopicCard) {
  return card.angle || card.scoreReason || "先讲用户当下最关心的问题，再落到可执行的业务动作。"
}

function fallbackCta(card: ApiTopicCard) {
  return card.cta || "评论或私信关键词，领取相关检查表或进一步咨询。"
}

const SCORE_LABELS: Record<keyof NonNullable<ApiTopicCard["scoreBreakdown"]>, string> = {
  projectFit: "项目匹配",
  contentValue: "内容价值",
  viralHook: "传播钩子",
  conversionFit: "成交关联",
  feasibility: "执行可行性",
}

function scoreDecisionReason(card: ApiTopicCard | null) {
  if (!card?.scoreBreakdown) return card?.rationale || card?.scoreReason || "这条和当前项目资料、内容目的和执行条件最匹配。"
  const entries = (Object.keys(card.scoreBreakdown) as Array<keyof NonNullable<ApiTopicCard["scoreBreakdown"]>>)
    .map((key) => ({ key, value: card.scoreBreakdown![key] }))
    .sort((a, b) => b.value - a.value)
  const strongest = entries[0]
  const weakest = entries[entries.length - 1]
  return `${card.score ? `总分 ${card.score}` : "证据不足，未给评分"}，强项是${SCORE_LABELS[strongest.key]}，短板是${SCORE_LABELS[weakest.key]}。${card.scoreReason || card.rationale || ""}`
}

function groupKeyForSource(source: TopicDailyReportSource): TopicEvidenceGroupKey {
  if (source.category === "client_project") return "project"
  if (source.category === "benchmark_reference") return "benchmark"
  if (source.category === "industry_hot") return "hot"
  return "customer"
}

const EVIDENCE_GROUP_META: Record<TopicEvidenceGroupKey, { label: string; description: string }> = {
  project: {
    label: "项目基准线",
    description: "判断这条选题是否贴合客户、产品和成交路径。",
  },
  customer: {
    label: "客户问题",
    description: "来自选题池、用户洞察、会议纪要和客户问答的真实问题。",
  },
  benchmark: {
    label: "对标证据",
    description: "来自对标账号、爆款作品和拆解文案的已验证信号。",
  },
  hot: {
    label: "热点线索",
    description: "只作为时效角度和话题入口，不替代最终判断。",
  },
}

function buildEvidenceGroups(sources: TopicDailyReportSource[]) {
  const grouped: Record<TopicEvidenceGroupKey, TopicDailyReportSource[]> = {
    project: [],
    customer: [],
    benchmark: [],
    hot: [],
  }

  for (const source of sources) {
    grouped[groupKeyForSource(source)].push(source)
  }

  return (Object.keys(grouped) as TopicEvidenceGroupKey[])
    .filter((key) => grouped[key].length > 0)
    .map((key) => ({
      key,
      ...EVIDENCE_GROUP_META[key],
      items: grouped[key].slice(0, 4),
    }))
}

function buildHotSources(items: ApiAiHotBriefingItem[]): TopicDailyReportSource[] {
  return items.slice(0, 4).map((item) => ({
    category: "industry_hot",
    title: item.title,
    content: `${item.categoryLabel || item.source}｜${item.summary}${item.url ? `｜${item.url}` : ""}`,
  }))
}

function buildConclusion(card: ApiTopicCard | null, groups: TopicDailyReport["evidenceGroups"]) {
  if (!card) return "今天还没有可用于决策的主推选题。"
  const labels = groups.map((group) => group.label).slice(0, 3)
  if (labels.length === 0) return `主推「${card.title}」，但本次缓存缺少证据快照，建议重新生成后再定稿。`
  return `主推「${card.title}」，主要依据是${labels.join("、")}。`
}

/**
 * @description 构建topicdailyreport
 * @param cards - cards
 * @param briefingItems - briefing条目列表
 * @param _mode - _mode
 * @param sources - sources
 * @returns TopicDailyReport
 */
export function buildTopicDailyReport(
  cards: ApiTopicCard[],
  briefingItems: ApiAiHotBriefingItem[],
  _mode: ApiTopicRecommendationMode,
  sources: TopicDailyReportSource[] = [],
): TopicDailyReport {
  const leadCard = getLeadCard(cards)
  const leadTitle = leadCard?.title || "今日主选题"
  const sourceSnapshot = sources.length > 0 ? sources : buildHotSources(briefingItems)
  const evidenceGroups = buildEvidenceGroups(sourceSnapshot)
  const action = leadCard ? fallbackCta(leadCard) : "先生成每日选题日报，再进入 AIM 写文案。"

  return {
    leadCard,
    conclusion: buildConclusion(leadCard, evidenceGroups),
    reason: scoreDecisionReason(leadCard),
    hasSourceSnapshot: sources.length > 0,
    evidenceGroups,
    workshop: cards.slice(0, 4).map((card, index) => ({
      index: index + 1,
      title: card.title,
      hook: fallbackHook(card),
      angle: fallbackAngle(card),
      cta: fallbackCta(card),
    })),
    execution: {
      hook: leadCard ? fallbackHook(leadCard) : "先抓住用户今天最关心的问题。",
      angle: leadCard ? fallbackAngle(leadCard) : "围绕痛点、判断和行动建议展开。",
      action,
    },
    copyText: `今日行动：主发「${leadTitle}」；${action}`,
  }
}

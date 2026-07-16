import type { ApiTopicCard } from "@/types/api"

const SCORE_DIMENSIONS = [
  ["projectFit", "项目匹配"],
  ["contentValue", "内容价值"],
  ["viralHook", "传播钩子"],
  ["conversionFit", "成交关联"],
  ["feasibility", "可执行"],
] as const

export function scoreEntries(card: ApiTopicCard) {
  const breakdown = card.scoreBreakdown
  if (!breakdown) return []
  return SCORE_DIMENSIONS.map(([key, label]) => ({ key, label, value: breakdown[key] }))
}

export function strongestAndWeakest(card: ApiTopicCard) {
  const entries = scoreEntries(card)
  if (entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  return { strongest: sorted[0], weakest: sorted[sorted.length - 1] }
}

export interface TopicCategoryGroup {
  key: string
  label: string
  cards: ApiTopicCard[]
}

const TOPIC_DISPLAY_GROUPS: TopicCategoryGroup[] = [
  { key: "hot_topic", label: "热点类", cards: [] },
  { key: "persona", label: "人设类", cards: [] },
  { key: "question_answer", label: "问题解答类", cards: [] },
  { key: "point_of_view", label: "观点类", cards: [] },
]

function getTopicDisplayGroupKey(card: ApiTopicCard) {
  const text = [card.title, card.rationale, card.contentLine, card.scoreReason].filter(Boolean).join(" ")

  if (/人设|身份|老板|经历|故事|信任|认识/.test(text) || card.topicType === "人设型") return "persona"
  if (/热点/.test(text) || card.sourceType === "行业热点") return "hot_topic"
  if (/观点|判断|认知|趋势|误区|反常识|立场/.test(text) || card.topicType === "流量型") return "point_of_view"
  return "question_answer"
}

export function getTopicDisplayLabel(card: ApiTopicCard) {
  return TOPIC_DISPLAY_GROUPS.find((group) => group.key === getTopicDisplayGroupKey(card))?.label ?? "问题解答类"
}

export function categorizeTopicCards(cards: ApiTopicCard[]): TopicCategoryGroup[] {
  const groups: TopicCategoryGroup[] = TOPIC_DISPLAY_GROUPS.map((group) => ({ ...group, cards: [] }))
  for (const card of cards) {
    groups.find((group) => group.key === getTopicDisplayGroupKey(card))?.cards.push(card)
  }
  return groups.filter((group) => group.cards.length > 0)
}

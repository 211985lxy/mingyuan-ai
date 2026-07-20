import type { ApiTopicCard } from "@/types/api"

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
  const text = [card.title, card.rationale, card.contentLine, card.scoreReason]
    .filter(Boolean)
    .join(" ")
  if (/人设|身份|老板|经历|故事|信任|认识/.test(text) || card.topicType === "人设型") return "persona"
  if (/热点/.test(text) || card.sourceType === "行业热点") return "hot_topic"
  if (/观点|判断|认知|趋势|误区|反常识|立场/.test(text) || card.topicType === "流量型") return "point_of_view"
  return "question_answer"
}

/**
 * @description 获取topicdisplaylabel
 * @param card - 卡片
 * @returns 无返回值
 */
export function getTopicDisplayLabel(card: ApiTopicCard) {
  return TOPIC_DISPLAY_GROUPS.find((group) => group.key === getTopicDisplayGroupKey(card))?.label
    ?? "问题解答类"
}

/**
 * @description categorizetopiccards
 * @param cards - cards
 * @returns TopicCategoryGroup[]
 */
export function categorizeTopicCards(cards: ApiTopicCard[]): TopicCategoryGroup[] {
  const groups = TOPIC_DISPLAY_GROUPS.map((group) => ({ ...group, cards: [] as ApiTopicCard[] }))
  for (const card of cards) {
    groups.find((group) => group.key === getTopicDisplayGroupKey(card))?.cards.push(card)
  }
  return groups.filter((group) => group.cards.length > 0)
}

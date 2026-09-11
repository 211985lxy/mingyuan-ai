import { describe, expect, it } from "vitest"

import { TOPIC_REVIEW_CARD_LIMIT, buildTopicReviewCard } from "@/lib/aim/feishu-topic-review-notify"
import type { TopicCard } from "@/lib/topic-validation"

const SELECTION_ID = "tsel_1"

function topicCard(title: string, score: number): TopicCard {
  return {
    title,
    elementCodes: ["curiosity"],
    openingTypeCode: "curiosity_open",
    structureCode: "suspense_reveal",
    score,
    scoreReason: `${title} 的理由`,
  }
}

function actionButtons(card: Record<string, unknown>) {
  const elements = card.elements as Array<Record<string, unknown>>
  const action = elements.find((element) => element.tag === "action")
  return (action?.actions ?? []) as Array<{ text: { content: string }; value: Record<string, unknown> }>
}

describe("topic review card", () => {
  it("按候选铺开采用按钮，并附加换一批与都不行", () => {
    const card = buildTopicReviewCard({
      selectionId: SELECTION_ID,
      cards: [topicCard("A", 91), topicCard("B", 80), topicCard("C", 70)],
      sources: [],
    })
    const buttons = actionButtons(card)

    expect(buttons.map((button) => button.text.content)).toEqual([
      "采用 1", "采用 2", "采用 3", "换一批", "都不行",
    ])
    expect(buttons[0].value).toEqual({
      topic_selection_id: SELECTION_ID,
      topic_action: "adopt",
      topic_index: 0,
    })
    expect(buttons[3].value).toEqual({ topic_selection_id: SELECTION_ID, topic_action: "regenerate" })
    expect(buttons[4].value).toEqual({ topic_selection_id: SELECTION_ID, topic_action: "reject" })
  })

  it("候选超过上限时只铺上限数量，避免按钮溢出卡片", () => {
    const cards = Array.from({ length: TOPIC_REVIEW_CARD_LIMIT + 3 }, (_, index) =>
      topicCard(`候选${index + 1}`, 90 - index),
    )
    const buttons = actionButtons(buildTopicReviewCard({ selectionId: SELECTION_ID, cards, sources: [] }))
    const adoptButtons = buttons.filter((button) => button.value.topic_action === "adopt")

    expect(adoptButtons).toHaveLength(TOPIC_REVIEW_CARD_LIMIT)
    expect(buttons).toHaveLength(TOPIC_REVIEW_CARD_LIMIT + 2)
  })

  it("把 AI 评分与主推结论写进卡片正文", () => {
    const card = buildTopicReviewCard({
      selectionId: SELECTION_ID,
      cards: [topicCard("领跑选题", 93), topicCard("备选选题", 71)],
      sources: [{ category: "benchmark_reference", title: "对标账号A", content: "爆款作品" }],
      projectName: "中汝达AI数字供暖",
    })
    const elements = card.elements as Array<{ tag: string; text?: { content?: string } }>
    const markdown = elements
      .filter((element) => element.tag === "div")
      .map((element) => element.text?.content ?? "")
      .join("\n")

    expect(markdown).toContain("中汝达AI数字供暖")
    expect(markdown).toContain("领跑选题")
    expect(markdown).toContain("93 分")
    expect(markdown).toContain("对标账号A")
    expect(markdown).toContain("AI 主推")
  })

  it("候选为空时不铺采用按钮，只留换一批与都不行", () => {
    const buttons = actionButtons(buildTopicReviewCard({ selectionId: SELECTION_ID, cards: [], sources: [] }))
    expect(buttons.map((button) => button.text.content)).toEqual(["换一批", "都不行"])
  })
})

import { describe, expect, it } from "vitest"
import { coerceTopicCards, normalizeTopicCards } from "@/lib/topic-generation"
import { TopicCardsSchema, TopicCardSchema } from "@/lib/topic-validation"
import type { TopicCard } from "@/lib/topic-validation"

const baseCard: TopicCard = {
  title: "先看客户流程",
  elementCodes: ["practical"],
  openingTypeCode: "pain_open",
  structureCode: "pain_solution",
}

describe("topic scoring", () => {
  it("accepts cards with a five-part score breakdown", () => {
    const result = TopicCardSchema.safeParse({
      ...baseCard,
      scoreBreakdown: {
        projectFit: 90,
        contentValue: 86,
        viralHook: 78,
        conversionFit: 82,
        feasibility: 88,
      },
      reviewVerdict: "strong",
      revisionAdvice: "可以直接主推。",
    })

    expect(result.success).toBe(true)
  })

  it("normalizes legacy cards with default score breakdown", () => {
    const [card] = normalizeTopicCards([baseCard], {
      topicSources: [{ category: "client_project", title: "客户资料", content: "客户要降低获客成本" }],
      recommendationMode: "normal",
    })

    expect(card.scoreBreakdown).toEqual({
      projectFit: 80,
      contentValue: 80,
      viralHook: 70,
      conversionFit: 75,
      feasibility: 80,
    })
    expect(card.reviewVerdict).toBe("usable")
    expect(card.revisionAdvice).toBe("补充更具体的客户场景或案例证据。")
  })

  it("calculates and clamps total score from breakdown", () => {
    const [card] = normalizeTopicCards([
      {
        ...baseCard,
        score: 999,
        scoreBreakdown: {
          projectFit: 100,
          contentValue: 120,
          viralHook: 90,
          conversionFit: 80,
          feasibility: 70,
        },
      },
    ], { recommendationMode: "daily" })

    expect(card.scoreBreakdown.contentValue).toBe(100)
    expect(card.score).toBe(90)
    expect(card.reviewVerdict).toBe("strong")
  })

  it("marks cards as revise when any dimension is weak", () => {
    const [card] = normalizeTopicCards([
      {
        ...baseCard,
        scoreBreakdown: {
          projectFit: 88,
          contentValue: 82,
          viralHook: 35,
          conversionFit: 80,
          feasibility: 76,
        },
      },
    ], { recommendationMode: "daily" })

    expect(card.reviewVerdict).toBe("revise")
    expect(card.revisionAdvice).toContain("传播钩子")
  })

  it("coerces loose LLM cards before schema validation", () => {
    const cards = coerceTopicCards([
      { title: "这是一个非常非常非常长的选题标题需要被截断", topicType: "热点型", rationale: "x".repeat(260) },
      { title: "第二个选题", elementCodes: ["unknown"], openingTypeCode: "bad_open", structureCode: "bad_structure" },
    ], ["practical", "trust"])

    const result = TopicCardsSchema.safeParse(normalizeTopicCards(cards, { recommendationMode: "daily" }))
    expect(result.success).toBe(true)
    expect(cards).toHaveLength(4)
    expect(cards[0].title.length).toBeLessThanOrEqual(20)
    expect(cards.every((card) => card.elementCodes.length > 0)).toBe(true)
  })
})

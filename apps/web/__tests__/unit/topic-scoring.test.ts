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

  it("does not fabricate a score breakdown when evidence is missing", () => {
    const [card] = normalizeTopicCards([baseCard], {
      topicSources: [{ category: "client_project", title: "客户资料", content: "客户要降低获客成本" }],
      recommendationMode: "normal",
    })

    expect(card.scoreBreakdown).toEqual({
      projectFit: null,
      contentValue: null,
      viralHook: null,
      conversionFit: null,
      feasibility: null,
    })
    expect(card.score).toBeUndefined()
    expect(card.reviewVerdict).toBeUndefined()
    expect(card.scoreReason).toContain("证据不足")
    expect(card.revisionAdvice).toContain("补充客户原话")
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

    expect(card.scoreBreakdown?.contentValue).toBe(100)
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

  // 回归：2026-09-17 早报 4 张卡因 creativeTrace 字段超长（每卡 1 个 160 上限错误）
  // 连续 3 轮校验失败整批降级为无评分模板卡。normalize 必须把超长字段截到位。
  it("clips overlong creativeTrace fields instead of failing the whole batch", () => {
    const cards = coerceTopicCards([
      {
        title: "命理依据写太长的选题",
        elementCodes: ["trust"],
        openingTypeCode: "curiosity_open",
        structureCode: "suspense_reveal",
        creativeTrace: {
          stylePositioning: "专".repeat(200), // schema max 120
          logicSteps: ["推".repeat(300), "逻辑步骤二", "逻辑步骤三"], // 每条 max 160
          sources: [
            { kind: "benchmark", source: "对标".repeat(200), usage: "用".repeat(300) }, // source max 160 / usage max 200
            { kind: "product", source: "产品来源", usage: "正常用法" },
            { kind: "persona", source: "人设来源", usage: "正常用法" },
          ],
          destinyAlignment: {
            baziBasis: "八".repeat(300), // max 160
            ziweiBasis: "紫".repeat(300), // max 160
            styleMapping: "风".repeat(400), // max 240
          },
        },
      },
      { title: "第二个选题" },
      { title: "第三个选题" },
      { title: "第四个选题" },
    ], ["trust"])

    const normalized = normalizeTopicCards(cards, { recommendationMode: "daily" })
    const result = TopicCardSchema.safeParse(normalized[0])
    if (!result.success) {
      console.error(result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`))
    }
    expect(result.success).toBe(true)
    expect(normalized[0]?.creativeTrace?.stylePositioning.length).toBeLessThanOrEqual(120)
    expect(normalized[0]?.creativeTrace?.logicSteps.every((s) => s.length <= 160)).toBe(true)
    expect(normalized[0]?.creativeTrace?.destinyAlignment.baziBasis.length).toBeLessThanOrEqual(160)
  })
})

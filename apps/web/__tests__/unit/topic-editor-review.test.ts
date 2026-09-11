import { describe, expect, it } from "vitest"
import { TopicCardSchema } from "@/lib/topic-validation"
import type { TopicCard } from "@/lib/topic-validation"
import {
  COMPETITOR_EVIDENCE_LIMIT,
  evaluateTopicCards,
  selectTopCompetitorEvidence,
} from "@/lib/topic-editor-review"

function card(title: string, score: number): TopicCard {
  return {
    title,
    elementCodes: ["curiosity"],
    openingTypeCode: "curiosity_open",
    structureCode: "suspense_reveal",
    score,
    scoreReason: `${title} 的模型自评分理由`,
  }
}

const fourCards = [
  card("流程比功能重要", 91),
  card("先改开头钩子", 80),
  card("别追新模型", 70),
  card("用客户原话开场", 60),
]

function reviewJson(
  reviews: Array<{ title: string; editorScore: number; editorVerdict: string; editorReason: string }>,
) {
  return JSON.stringify({ reviews })
}

describe("TopicCard editorReview 向后兼容", () => {
  it("旧卡片没有 editorReview 仍能解析", () => {
    const result = TopicCardSchema.safeParse(card("旧卡没有主编字段", 88))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.editorReview).toBeUndefined()
  })

  it("新卡片可以带上主编评分、判定和一句话理由", () => {
    const result = TopicCardSchema.safeParse({
      ...card("主编已审", 70),
      editorReview: {
        editorScore: 86,
        editorVerdict: "strong",
        editorReason: "对得上对标账号爆款母题，陌生化够用。",
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.score).toBe(70)
      expect(result.data.editorReview).toEqual({
        editorScore: 86,
        editorVerdict: "strong",
        editorReason: "对得上对标账号爆款母题，陌生化够用。",
      })
    }
  })
})

describe("evaluateTopicCards", () => {
  it("注入替身后把主编结论写进卡片，并保留模型自评分", async () => {
    const reviewed = await evaluateTopicCards(fourCards, {}, async () =>
      reviewJson([
        { title: "流程比功能重要", editorScore: 72, editorVerdict: "usable", editorReason: "能做，但钩子一般。" },
        { title: "先改开头钩子", editorScore: 90, editorVerdict: "strong", editorReason: "对标爆款同构，陌生化清楚。" },
        { title: "别追新模型", editorScore: 40, editorVerdict: "revise", editorReason: "对不上任何对标母题。" },
        { title: "用客户原话开场", editorScore: 81, editorVerdict: "usable", editorReason: "转化路径清楚。" },
      ]),
    )

    expect(reviewed.map((item) => item.score)).toEqual([91, 80, 70, 60])
    expect(reviewed[0].editorReview).toEqual({
      editorScore: 72,
      editorVerdict: "usable",
      editorReason: "能做，但钩子一般。",
    })
    expect(reviewed[1].editorReview?.editorScore).toBe(90)
    expect(reviewed[2].editorReview?.editorVerdict).toBe("revise")
  })

  it("评审抛错时静默降级，卡片原样返回且不伪造 editorReview", async () => {
    const reviewed = await evaluateTopicCards(fourCards, {}, async () => {
      throw new Error("LLM timeout")
    })
    expect(reviewed).toEqual(fourCards)
    expect(reviewed.every((item) => item.editorReview === undefined)).toBe(true)
  })

  it("评审返回坏 JSON 时静默降级", async () => {
    const reviewed = await evaluateTopicCards(fourCards, {}, async () => "不是 json")
    expect(reviewed.every((item) => item.editorReview === undefined)).toBe(true)
    expect(reviewed[0].score).toBe(91)
  })

  it("把对标真实数据写进评审提示，并要求不得臆测播放量", async () => {
    let userPrompt = ""
    let systemPrompt = ""
    await evaluateTopicCards(
      fourCards,
      {
        projectName: "中汝达",
        competitorEvidence: [
          { account: "对标A", title: "冬天漏风怎么办", likes: 12800, comments: 320, shares: 90, collects: 410 },
        ],
      },
      async (input) => {
        systemPrompt = input.systemPrompt
        userPrompt = input.userPrompt
        return reviewJson(fourCards.map((item) => ({
          title: item.title,
          editorScore: 50,
          editorVerdict: "observe",
          editorReason: "先观察。",
        })))
      },
    )

    expect(systemPrompt).toContain("只做评审")
    expect(systemPrompt).toContain("不得臆测")
    expect(systemPrompt).toContain("陌生化")
    expect(userPrompt).toContain("对标A")
    expect(userPrompt).toContain("冬天漏风怎么办")
    expect(userPrompt).toContain("赞12800")
    expect(userPrompt).toContain("评320")
    expect(userPrompt).toContain("转90")
    expect(userPrompt).toContain("藏410")
    expect(userPrompt).toContain("中汝达")
  })
})

describe("selectTopCompetitorEvidence", () => {
  it("按热度排序并截断到上限", () => {
    const evidence = selectTopCompetitorEvidence(
      [
        {
          nickname: "账号甲",
          targetUrl: "https://a.example",
          viralVideos: [
            { title: "低热度", likes: 10, comments: 1, shares: 0, collects: 0 },
            { title: "最高热度", likes: 9000, comments: 100, shares: 50, collects: 80 },
          ],
          latestVideos: [{ title: "中等热度", likes: 500, comments: 20, shares: 10, collects: 30 }],
        },
        {
          nickname: null,
          targetUrl: "https://b.example",
          viralVideos: Array.from({ length: COMPETITOR_EVIDENCE_LIMIT }, (_, index) => ({
            title: `灌水${index}`,
            likes: 100 - index,
            comments: 0,
            shares: 0,
            collects: 0,
          })),
        },
      ],
    )

    expect(evidence).toHaveLength(COMPETITOR_EVIDENCE_LIMIT)
    expect(evidence[0]).toMatchObject({ account: "账号甲", title: "最高热度", likes: 9000 })
    expect(evidence.some((item) => item.title === "低热度")).toBe(false)
  })

  it("坏数据直接跳过，不编造赞评转藏", () => {
    const evidence = selectTopCompetitorEvidence([
      {
        nickname: "空号",
        targetUrl: "https://empty.example",
        viralVideos: "not-an-array",
        latestVideos: [{ title: "  " }, { likes: 99 }],
      },
    ])
    expect(evidence).toEqual([])
  })
})

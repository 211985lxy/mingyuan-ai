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

  it("AI 主推跟主编评分走，并写出主编结论", () => {
    const card = buildTopicReviewCard({
      selectionId: SELECTION_ID,
      cards: [
        {
          ...topicCard("自评分更高", 99),
          editorReview: { editorScore: 60, editorVerdict: "usable", editorReason: "能发但钩子弱。" },
        },
        {
          ...topicCard("主编主推", 70),
          editorReview: { editorScore: 92, editorVerdict: "strong", editorReason: "对应对标账号甲的母题（1.2万赞）。" },
        },
      ],
      sources: [],
    })
    const markdown = (card.elements as Array<{ tag: string; text?: { content?: string } }>)
      .filter((element) => element.tag === "div")
      .map((element) => element.text?.content ?? "")
      .join("\n")

    const selfLine = markdown.split("\n").find((line) => line.includes("**1. 自评分更高**")) ?? ""
    const editorLine = markdown.split("\n").find((line) => line.includes("**2. 主编主推**")) ?? ""
    expect(editorLine).toContain("AI 主推")
    expect(selfLine).not.toContain("AI 主推")
    expect(markdown).toContain("对应对标账号甲的母题（1.2万赞）")
    expect(markdown).toContain("主编 92")
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

  it("参考素材区：列出拆解原视频与对标账号主页，去重限量", () => {
    const card = buildTopicReviewCard({
      selectionId: SELECTION_ID,
      cards: [topicCard("选题A", 90)],
      sources: [
        {
          category: "benchmark_reference",
          title: "拆解｜获客型视频",
          content: "对标文案拆解信号\n来源：https://v.douyin.com/abc/",
        },
        {
          category: "benchmark_reference",
          title: "对标账号甲",
          content: "已验证内容信号\n来源账号：https://example.com/jia\n1. 爆款｜赞1｜原片：https://www.douyin.com/video/vid1",
        },
        {
          category: "benchmark_reference",
          title: "拆解｜获客型视频",
          content: "重复来源\n来源：https://v.douyin.com/abc/",
        },
        { category: "industry_hot", title: "热点不算参考素材", content: "来源：https://example.com/hot" },
      ],
    })
    const markdown = (card.elements as Array<{ tag: string; text?: { content?: string } }>)
      .filter((element) => element.tag === "div")
      .map((element) => element.text?.content ?? "")
      .join("\n")

    expect(markdown).toContain("参考素材")
    expect(markdown).toContain("[拆解｜获客型视频](https://v.douyin.com/abc/)")
    expect(markdown).toContain("[对标账号甲｜爆款原片](https://www.douyin.com/video/vid1)")
    expect(markdown).toContain("[对标账号甲｜账号主页](https://example.com/jia)")
    // 重复链接只出现一次
    expect(markdown.split("v.douyin.com/abc/").length - 1).toBe(1)
    // 非对标来源不进参考素材
    expect(markdown).not.toContain("example.com/hot")
  })

  it("无对标来源时不渲染参考素材区块", () => {
    const card = buildTopicReviewCard({
      selectionId: SELECTION_ID,
      cards: [topicCard("选题A", 90)],
      sources: [{ category: "industry_hot", title: "热点", content: "热点内容" }],
    })
    const markdown = (card.elements as Array<{ tag: string; text?: { content?: string } }>)
      .filter((element) => element.tag === "div")
      .map((element) => element.text?.content ?? "")
      .join("\n")

    expect(markdown).not.toContain("参考素材")
  })
})

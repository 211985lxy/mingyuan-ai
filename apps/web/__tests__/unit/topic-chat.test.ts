import { describe, expect, it } from "vitest"
import {
  buildTopicChatReply,
  buildTopicKnowledgeDraft,
  classifyTopicChatInput,
} from "@/lib/topic-chat"

describe("topic chat", () => {
  it("classifies customer objections as user insight", () => {
    const result = classifyTopicChatInput("今天客户又问我为什么报价比别人高")

    expect(result).toEqual({
      category: "user_insight",
      reason: "客户问题或成交顾虑",
    })
  })

  it("classifies links and benchmark wording as benchmark reference", () => {
    const result = classifyTopicChatInput("这个爆款开头可以参考：https://example.com/video")

    expect(result.category).toBe("benchmark_reference")
  })

  it("classifies loose ideas as daily inspiration", () => {
    const result = classifyTopicChatInput("刚才开会想到一个角度，老板讲交付要有边界")

    expect(result.category).toBe("daily_inspiration")
  })

  it("builds a knowledge draft from the classification", () => {
    const draft = buildTopicKnowledgeDraft({
      content: "今天客户又问我为什么报价比别人高",
      classification: { category: "user_insight", reason: "客户问题或成交顾虑" },
    })

    expect(draft).toEqual({
      category: "user_insight",
      title: "客户问题：为什么报价比别人高",
      content: "今天客户又问我为什么报价比别人高",
      tags: ["topic_chat", "auto_captured", "asset_role:pain"],
      sourceType: "manual",
    })
  })

  it("builds a customer-facing reply from generated cards", () => {
    const reply = buildTopicChatReply({
      savedTitle: "客户问题：为什么报价比别人高",
      cards: [
        {
          title: "贵在哪里",
          hook: "客户问你为什么贵，千万别先解释成本。",
          angle: "先讲便宜方案省掉了什么，再讲你的交付边界。",
        },
        { title: "报价的底气", hook: "报价高不可怕，怕的是客户不知道差在哪。" },
        { title: "别只比价格", rationale: "适合把成交顾虑转成信任内容。" },
      ],
    })

    expect(reply).toEqual({
      summary: "这句话已经沉淀为：客户问题：为什么报价比别人高",
      recommendedTitle: "贵在哪里",
      opening: "客户问你为什么贵，千万别先解释成本。",
      alternatives: ["报价的底气", "别只比价格"],
      nextActionLabel: "继续写成口播稿",
    })
  })
})

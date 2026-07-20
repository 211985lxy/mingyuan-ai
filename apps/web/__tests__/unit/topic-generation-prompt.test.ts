import { describe, expect, it, vi } from "vitest"
import { buildTopicSystemPrompt, buildTopicUserPrompt, generateTopicCards } from "@/lib/topic-generation"

const completeMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/llm/agent-router", () => ({
  getAgentLLM: () => ({ complete: completeMock }),
}))

describe("buildTopicUserPrompt", () => {
  it("requires every topic to explain its style, sources, logic, and destiny alignment", () => {
    const prompt = buildTopicSystemPrompt("fresh", [])

    expect(prompt).toContain("creativeTrace")
    expect(prompt).toContain("风格定位")
    expect(prompt).toContain("推导逻辑")
    expect(prompt).toContain("对标爆款视频")
    expect(prompt).toContain("产品卖点")
    expect(prompt).toContain("人设特点")
    expect(prompt).toContain("八字")
    expect(prompt).toContain("紫微")
    expect(prompt).toContain("未提供/待补充")
  })

  it("requires benchmark rewrites to follow the current IP profile", () => {
    const prompt = buildTopicUserPrompt({
      ipProfile: {
        displayName: "相宇",
        industry: "AI 商业咨询",
        primaryOffer: "AI 智能体陪跑",
        targetAudience: "中小企业老板",
        ipTraits: "反常识、实战派",
        toneOfVoice: "直接、口语化",
      },
      elements: [
        { code: "practical", name: "实用", typeLabel: "价值", description: "给具体方法" },
        { code: "contrast", name: "反差", typeLabel: "钩子", description: "制造认知反差" },
      ],
      topicSources: [
        {
          category: "benchmark_reference",
          title: "健身对标文案",
          content: "多去跟AI吵架，少跟健身博主扯皮。",
        },
      ],
    }, ["practical", "contrast"])

    expect(prompt).toContain("对标优先规则")
    expect(prompt).toContain("来源权重")
    expect(prompt).toContain("第一优先：对标账号、对标文案拆解")
    expect(prompt).toContain("第二优先：行业热点 / AI HOT")
    expect(prompt).toContain("至少 2 张选题")
    expect(prompt).toContain("对标信号")
    expect(prompt).toContain("不能照抄标题、原句或原行业模板")
    expect(prompt).toContain("AI HOT 或行业热点")
  })

  it("falls back to valid benchmark-led cards when the model returns invalid JSON", async () => {
    completeMock.mockRejectedValue(new Error("bad model output"))

    const result = await generateTopicCards({
      elements: [
        { code: "practical", name: "实用", typeLabel: "价值", description: "给具体方法" },
        { code: "contrast", name: "反差", typeLabel: "钩子", description: "制造认知反差" },
      ],
      forcedElementCodes: ["practical", "contrast"],
      topicSources: [
        {
          category: "benchmark_reference",
          title: "对标账号",
          content: "对标账号已验证内容信号：1. 爆款标题｜赞100 评10 转5 藏20",
        },
        {
          category: "industry_hot",
          title: "AI HOT",
          content: "辅助热点",
        },
      ],
      recommendationMode: "daily",
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(4)
    expect(result.cards.every((card) => card.sourceType === "对标参考")).toBe(true)
    expect(result.cards.every((card) => card.creativeTrace?.sources.some((source) => source.kind === "benchmark" && source.source === "对标账号"))).toBe(true)
    expect(result.cards.every((card) => card.creativeTrace?.destinyAlignment.baziBasis === "未提供/待补充")).toBe(true)
    expect(result.model).toContain("fallback")
  })

  it("falls back with project sources when no benchmark source exists", async () => {
    completeMock.mockRejectedValue(new Error("bad model output"))

    const result = await generateTopicCards({
      elements: [
        { code: "practical", name: "实用", typeLabel: "价值", description: "给具体方法" },
        { code: "contrast", name: "反差", typeLabel: "钩子", description: "制造认知反差" },
      ],
      forcedElementCodes: ["practical", "contrast"],
      topicSources: [{ category: "client_project", title: "项目资料", content: "客户想降低获客成本" }],
      recommendationMode: "daily",
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(4)
    expect(result.cards[0].sourceType).toBe("客户资料")
  })
})

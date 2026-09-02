import { describe, expect, it } from "vitest"

import { buildOpeningRecommendationPrompt } from "@/lib/aim-opening-recommendation"

describe("opening recommendation prompt", () => {
  it("formalizes the long-form opening hook methodology instead of generic openings", () => {
    const prompt = buildOpeningRecommendationPrompt({
      commandInput: "优化开头",
      openingSegment: "你有没有过这种感觉？别人拼命争的东西，你根本不想要。",
      fullText: "完整稿子",
    })

    expect(prompt).toContain("你是一个专业的爆款内容开头策划师")
    expect(prompt).toContain("让用户在 1-3 秒内产生兴趣")
    expect(prompt).toContain("爆款开头类型")
    expect(prompt).toContain("开头公式库")
    expect(prompt).toContain("第一秒必须有停留理由")
    expect(prompt).toContain("禁止空泛开场")
    expect(prompt).toContain("以下为基于当前信息的默认假设")
    // 数量/画面建议/推荐榜只按用户明确要求给，不再固定 10 条 / 3 画面 / 推荐榜
    expect(prompt).not.toContain("至少输出 10 条")
    expect(prompt).not.toContain("最推荐的 3 条")
    expect(prompt).toContain("数量严格按用户指令")
    expect(prompt).toContain("开头画面建议")
    expect(prompt).toContain("先用一句话追问需要几条开头")
  })
})

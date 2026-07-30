import { describe, expect, it, vi } from "vitest"

/**
 * generateTopicCards 降级（degraded）契约测试。
 *
 * 历史 bug：LLM 多次重试失败后，buildFallbackTopicResult 用模板占位选题冒充成功
 * （success: true），下游无法区分「真实生成」与「占位兜底」，静默把占位选题当成
 * 正常结果交付。本测试锁定：fallback 路径必须返回 degraded: true，正常生成返回
 * degraded: false，使下游（前端/日志/监控）能区分并提示用户。
 */

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
}))

vi.mock("@/lib/llm/agent-router", () => ({
  getAgentLLM: () => ({ complete: mocks.complete }),
}))

import { generateTopicCards } from "@/lib/topic-generation"

const baseInput = {
  ipProfile: null,
  topicSources: [{ category: "client_project", title: "项目资料", content: "围绕当前项目资料生成选题。" }],
  elements: [
    { code: "cost", label: "成本" },
    { code: "authority", label: "权威" },
    { code: "trust", label: "信任" },
  ],
  recommendationMode: "normal" as const,
}

describe("generateTopicCards 降级标志 degraded", () => {
  it("LLM 全部失败时返回 degraded: true 的兜底结果（不再静默冒充成功）", async () => {
    // LLM 每次都抛错，触发 3 次重试失败 → fallback
    mocks.complete.mockRejectedValue(new Error("LLM 不可用"))

    const result = await generateTopicCards(baseInput as any)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.degraded).toBe(true)
      // model 带 :fallback 后缀，便于日志追溯
      expect(result.model).toContain(":fallback")
      // 占位卡片仍是 4 张（不破坏现有兜底行为）
      expect(result.cards).toHaveLength(4)
    }
  })

  it("LLM 正常返回时 degraded: false（真实生成）", async () => {
    // 返回 4 张合法卡片
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        topics: [
          { title: "选题一", elementCodes: ["cost"], openingTypeCode: "pain_open", structureCode: "pain_solution", rationale: "测试选题一", topicType: "转化型", sourceType: "客户资料" },
          { title: "选题二", elementCodes: ["authority"], openingTypeCode: "contrast_open", structureCode: "contrast_hook", rationale: "测试选题二", topicType: "人设型", sourceType: "客户资料" },
          { title: "选题三", elementCodes: ["trust"], openingTypeCode: "benefit_open", structureCode: "three_beat_ramp", rationale: "测试选题三", topicType: "流量型", sourceType: "客户资料" },
          { title: "选题四", elementCodes: ["cost"], openingTypeCode: "fear_open", structureCode: "before_after", rationale: "测试选题四", topicType: "转化型", sourceType: "客户资料" },
        ],
      }),
      model: "test-model",
    })

    const result = await generateTopicCards(baseInput as any)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.degraded).toBe(false)
      expect(result.model).toBe("test-model")
    }
  })
})

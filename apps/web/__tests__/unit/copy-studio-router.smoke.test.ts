import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } }
  },
}))

describe("copy_studio 模块路由与旧 agentId 别名", () => {
  beforeEach(() => {
    process.env.LIHUO_API_KEY = "test-lihuo"
    process.env.OPENROUTER_API_KEY = "test-openrouter"
    process.env.DEEPSEEK_API_KEY = "test-deepseek"
    process.env.JIEKOU_API_KEY = "test-jiekou"
    process.env.THEROUTER_API_KEY = "test-therouter"
    process.env.GLM_API_KEY = "test-glm"
    process.env.QIANFAN_API_KEY = "test-qianfan"
    process.env.DASHSCOPE_API_KEY = "test-dashscope"
    process.env.DOUBAO_API_KEY = "test-doubao"
    vi.resetModules()
  })

  it("editor_text 别名到 copy_studio.polish，首选 dashscope/qwen-plus", async () => {
    const { getAgentRecommendedModel } = await import("@/lib/llm/agent-router")
    expect(getAgentRecommendedModel("editor_text")).toBe("qwen-plus")
  })

  it("新模块键 copy_studio.polish 直连可用", async () => {
    const { getAgentRecommendedModel } = await import("@/lib/llm/agent-router")
    expect(getAgentRecommendedModel("copy_studio.polish")).toBe("qwen-plus")
  })

  it("copy_studio.outline 首选 lihuo/gpt-5.5", async () => {
    const { getAgentRecommendedModel } = await import("@/lib/llm/agent-router")
    expect(getAgentRecommendedModel("copy_studio.outline")).toBe("gpt-5.5")
  })

  it("旧 agentId 与新模块键解析到同一首选模型", async () => {
    const { getAgentRecommendedModel } = await import("@/lib/llm/agent-router")
    expect(getAgentRecommendedModel("deep_copywriter")).toBe(
      getAgentRecommendedModel("copy_studio.deep_article")
    )
    expect(getAgentRecommendedModel("content_producer")).toBe(
      getAgentRecommendedModel("copy_studio.social_post")
    )
  })
})

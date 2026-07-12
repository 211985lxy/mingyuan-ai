import { beforeEach, describe, expect, it, vi } from "vitest"

const ctorArgs: Array<Record<string, unknown>> = []

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(config: Record<string, unknown>) {
      ctorArgs.push(config)
    }

    chat = {
      completions: {
        create: vi.fn(),
      },
    }
  },
}))

describe("agent router timeout overrides", () => {
  beforeEach(() => {
    ctorArgs.length = 0
    process.env.LIHUO_API_KEY = "test-lihuo"
    process.env.OPENROUTER_API_KEY = "test-openrouter"
    process.env.DEEPSEEK_API_KEY = "test-deepseek"
    process.env.JIEKOU_API_KEY = "test-jiekou"
    process.env.THEROUTER_API_KEY = "test-therouter"
    process.env.GLM_API_KEY = "test-glm"
    process.env.LLM_TIMEOUT_MS = "60000"
    vi.resetModules()
  })

  it("caps business_diagnosis providers below the global timeout", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")

    getAgentLLM("business_diagnosis")

    expect(ctorArgs.length).toBeGreaterThan(0)
    expect(ctorArgs.every((config) => config.timeout === 20000)).toBe(true)
  })

  it("keeps other agents on the default provider timeout", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")

    getAgentLLM("content_producer")

    expect(ctorArgs.length).toBeGreaterThan(0)
    expect(ctorArgs.every((config) => config.timeout === 60000)).toBe(true)
  })

  it("keeps DeepSeek in every text agent route", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")
    const textAgents = [
      "content_producer",
      "free_copywriter",
      "deep_copywriter",
      "business_diagnosis",
      "business_system_diagnosis",
      "content_review",
      "persona",
    ]

    for (const agentId of textAgents) {
      expect(getAgentLLM(agentId).providerNames, agentId).toContain("deepseek")
    }
  })
})

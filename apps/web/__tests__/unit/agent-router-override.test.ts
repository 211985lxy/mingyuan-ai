import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

describe("agent router model override (A/B harness)", () => {
  beforeEach(() => {
    ctorArgs.length = 0
    process.env.LIHUO_API_KEY = "test-lihuo"
    process.env.OPENROUTER_API_KEY = "test-openrouter"
    process.env.DEEPSEEK_API_KEY = "test-deepseek"
    process.env.JIEKOU_API_KEY = "test-jiekou"
    process.env.THEROUTER_API_KEY = "test-therouter"
    process.env.GLM_API_KEY = "test-glm"
    vi.resetModules()
  })

  afterEach(async () => {
    const { clearAgentModelOverride } = await import("@/lib/llm/agent-router")
    clearAgentModelOverride("deep_copywriter")
  })

  it("prepends the override route as the preferred provider", async () => {
    const { getAgentLLM, getAgentRecommendedModel, setAgentModelOverride } = await import(
      "@/lib/llm/agent-router"
    )

    setAgentModelOverride("deep_copywriter", { name: "openrouter", model: "moonshotai/kimi-k2.6" })
    getAgentLLM("deep_copywriter")

    // The override provider is constructed first.
    expect(ctorArgs.length).toBeGreaterThan(0)
    expect(ctorArgs[0].baseURL).toContain("openrouter")
    // Recommended model reflects the active override.
    expect(getAgentRecommendedModel("deep_copywriter")).toBe("moonshotai/kimi-k2.6")
  })

  it("falls back to the base route chain when no override is set", async () => {
    const { getAgentLLM, getAgentRecommendedModel } = await import("@/lib/llm/agent-router")

    getAgentLLM("deep_copywriter")

    expect(ctorArgs.length).toBeGreaterThan(0)
    // no override → production default (lihuo/gpt-5.5)
    expect(getAgentRecommendedModel("deep_copywriter")).toBe("gpt-5.5")
  })

  it("clears the override so subsequent calls use the default again", async () => {
    const { getAgentRecommendedModel, setAgentModelOverride, clearAgentModelOverride } = await import(
      "@/lib/llm/agent-router"
    )

    setAgentModelOverride("deep_copywriter", { name: "openrouter", model: "moonshotai/kimi-k2.6" })
    expect(getAgentRecommendedModel("deep_copywriter")).toBe("moonshotai/kimi-k2.6")
    clearAgentModelOverride("deep_copywriter")
    expect(getAgentRecommendedModel("deep_copywriter")).toBe("gpt-5.5")
  })

  it("override chain still falls back through the base providers on failure", async () => {
    const { getAgentLLM, setAgentModelOverride } = await import("@/lib/llm/agent-router")

    setAgentModelOverride("deep_copywriter", { name: "openrouter", model: "moonshotai/kimi-k2.6" })
    getAgentLLM("deep_copywriter")

    // override (1) + base deep_copywriter chain (7 configured providers) = 8
    expect(ctorArgs.length).toBeGreaterThanOrEqual(8)
  })
})

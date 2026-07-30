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
    process.env.APIMART_API_KEY = "test-apimart"
    process.env.APIMART_PROXY_URL = "http://127.0.0.1:10808"
    process.env.OPENROUTER_API_KEY = "test-openrouter"
    process.env.DEEPSEEK_API_KEY = "test-deepseek"
    process.env.JIEKOU_API_KEY = "test-jiekou"
    process.env.THEROUTER_API_KEY = "test-therouter"
    process.env.GLM_API_KEY = "test-glm"
    process.env.ZENMUX_API_KEY = "test-zenmux"
    process.env.LLM_TIMEOUT_MS = "60000"
    vi.resetModules()
  })

  it("gives APIMart enough time for long diagnosis and caps later fallbacks", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")

    getAgentLLM("business_diagnosis")

    const apimart = ctorArgs.find((config) => config.baseURL === "https://api.apimart.ai/v1")
    const laterFallbacks = ctorArgs.filter((config) => config.baseURL !== "https://api.apimart.ai/v1")
    expect(apimart?.timeout).toBe(60000)
    expect(laterFallbacks.length).toBeGreaterThan(0)
    expect(laterFallbacks.every((config) => config.timeout === 20000)).toBe(true)
  })

  it("uses the verified APIMart route first for business diagnosis", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")

    expect(getAgentLLM("business_diagnosis").providerNames[0]).toBe("apimart")
  })

  it("routes content_producer to ZenMux Claude first with DeepSeek fallback", async () => {
    const { getAgentLLM, getAgentRecommendedModel } = await import("@/lib/llm/agent-router")

    const llm = getAgentLLM("content_producer")
    expect(llm.providerNames[0]).toBe("zenmux")
    expect(getAgentRecommendedModel("content_producer")).toBe("anthropic/claude-sonnet-4.6")
    expect(llm.providerNames).toContain("deepseek")
    expect(llm.providerNames).toContain("apimart")

    const zenmux = ctorArgs.find((config) => String(config.baseURL || "").includes("zenmux"))
    expect(zenmux?.timeout).toBe(120000)
    expect(zenmux?.fetchOptions).toMatchObject({ dispatcher: expect.any(Object) })
  })

  it("routes business_system_diagnosis to ZenMux Claude first with DeepSeek fallback", async () => {
    const { getAgentLLM, getAgentRecommendedModel } = await import("@/lib/llm/agent-router")
    ctorArgs.length = 0

    const llm = getAgentLLM("business_system_diagnosis")
    expect(llm.providerNames[0]).toBe("zenmux")
    expect(getAgentRecommendedModel("business_system_diagnosis")).toBe("anthropic/claude-sonnet-4.6")
    expect(llm.providerNames).toContain("deepseek")
    expect(llm.providerNames).toContain("apimart")

    const zenmux = ctorArgs.find((config) => String(config.baseURL || "").includes("zenmux"))
    expect(zenmux?.timeout).toBe(120000)
  })

  it("attaches proxy dispatcher to ZenMux when APIMART_PROXY_URL is set", async () => {
    const { getProviderConfigs } = await import("@/lib/llm/config")
    const zenmux = getProviderConfigs().find((config) => config.name === "zenmux")
    expect(zenmux?.proxyURL).toBe("http://127.0.0.1:10808")
  })

  it("keeps non-Claude-primary agents on the default provider timeout", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")
    ctorArgs.length = 0

    getAgentLLM("content_review")

    expect(ctorArgs.length).toBeGreaterThan(0)
    expect(ctorArgs.every((config) => config.timeout === 60000)).toBe(true)
  })

  it("keeps DeepSeek in every text agent route", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")
    const textAgents = [
      "content_producer",
      "free_copywriter",
      "work_editor",
      "business_diagnosis",
      "business_system_diagnosis",
      "content_review",
    ]

    for (const agentId of textAgents) {
      expect(getAgentLLM(agentId).providerNames, agentId).toContain("deepseek")
    }
  })

  it("keeps APIMart as a fallback in every text agent route", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")
    const textAgents = [
      "content_producer",
      "free_copywriter",
      "work_editor",
      "business_diagnosis",
      "business_system_diagnosis",
      "content_review",
    ]

    for (const agentId of textAgents) {
      expect(getAgentLLM(agentId).providerNames, agentId).toContain("apimart")
    }
  })

  it("passes the APIMart proxy to the OpenAI-compatible client", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")

    getAgentLLM("content_producer")

    const apimart = ctorArgs.find((config) => config.baseURL === "https://api.apimart.ai/v1")
    expect(apimart?.fetchOptions).toMatchObject({ dispatcher: expect.any(Object) })
  })

  it("filters routes below the policy minimum capability", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")

    const llm = getAgentLLM("work_editor", {
      minimumCapability: "standard",
      maxProviderAttempts: 3,
    })

    expect(llm.providerNames).toContain("deepseek")
    expect(llm.providerNames).not.toContain("jiekou")
  })

  it("reuses one ProxyAgent per proxy URL and never leaks (no per-request allocation)", async () => {
    const { getSharedProxyAgent, destroySharedProxyAgents } = await import("@/lib/llm/provider")

    // 同一代理 URL：多次获取必须返回同一个 dispatcher 实例（修复 per-request 连接池泄漏）
    const first = getSharedProxyAgent("http://127.0.0.1:10808")
    const second = getSharedProxyAgent("http://127.0.0.1:10808")
    expect(second).toBe(first)

    // 不同代理 URL：各自独立缓存，互不串用
    const other = getSharedProxyAgent("http://127.0.0.1:10809")
    expect(other).not.toBe(first)

    // 销毁后缓存清空，再次获取得到全新实例
    destroySharedProxyAgents()
    const recreated = getSharedProxyAgent("http://127.0.0.1:10808")
    expect(recreated).not.toBe(first)
  })

  it("lists deduped routed model targets for the probe script", async () => {
    const { listRoutedModelTargets } = await import("@/lib/llm/agent-router")
    const targets = listRoutedModelTargets()
    expect(targets.length).toBeGreaterThan(5)
    const keys = new Set(targets.map((t) => `${t.provider}::${t.model ?? ""}`))
    expect(keys.size).toBe(targets.length)
    expect(
      targets.some((t) => t.provider === "zenmux" && t.model === "anthropic/claude-sonnet-4.6"),
    ).toBe(true)
    expect(targets.some((t) => t.provider === "deepseek")).toBe(true)
  })
})

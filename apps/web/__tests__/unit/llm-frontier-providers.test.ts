import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 前沿直连供应商注册契约（Gemini / Kimi / Grok / Qwen）。
 *
 * 背景：这四家此前完全不在 provider 列表里——Gemini 尤其是一处空白：
 * `apps/web/src` 里没有任何 gemini 相关代码，产品根本无法用 Gemini 写任何东西。
 *
 * 关键约束（写错就会线上 400）：
 * - 直连供应商必须声明 ownModelPrefixes，且只认不带 `/` 的原生模型名；
 *   跨网关名（anthropic/claude-opus-4.6 之类）必须走聚合网关。
 * - Gemini 的 OpenAI 兼容 baseURL 已含 /v1beta/openai，末尾不能再拼 /v1。
 */
describe("前沿直连供应商注册", () => {
  beforeEach(() => {
    process.env.LIHUO_API_KEY = "test-lihuo"
    process.env.APIMART_API_KEY = "test-apimart"
    process.env.APIMART_PROXY_URL = "http://127.0.0.1:10808"
    process.env.DEEPSEEK_API_KEY = "test-deepseek"
    process.env.DOUBAO_API_KEY = "test-doubao"
    process.env.ZENMUX_API_KEY = "test-zenmux"
    process.env.OPENROUTER_API_KEY = "test-openrouter"
    process.env.GEMINI_API_KEY = "test-gemini"
    process.env.MOONSHOT_API_KEY = "test-moonshot"
    process.env.XAI_API_KEY = "test-xai"
    process.env.DASHSCOPE_API_KEY = "test-dashscope"
    delete process.env.GEMINI_PROXY_URL
    delete process.env.XAI_PROXY_URL
    vi.resetModules()
  })

  it("四家供应商在密钥存在时注册，且 baseURL 与路由前缀正确", async () => {
    const { getProviderConfigs } = await import("@/lib/llm/config")
    const byName = new Map(getProviderConfigs().map((config) => [config.name, config]))

    expect(byName.get("gemini")?.baseURL).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai",
    )
    expect(byName.get("gemini")?.ownModelPrefixes).toEqual(["gemini"])
    expect(byName.get("moonshot")?.baseURL).toBe("https://api.moonshot.cn/v1")
    expect(byName.get("moonshot")?.ownModelPrefixes).toEqual(["kimi", "moonshot"])
    expect(byName.get("xai")?.baseURL).toBe("https://api.x.ai/v1")
    expect(byName.get("xai")?.ownModelPrefixes).toEqual(["grok"])
    expect(byName.get("dashscope")?.baseURL).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    )
    expect(byName.get("dashscope")?.ownModelPrefixes).toEqual(["qwen", "qwq"])

    // 直连供应商不得被当成聚合网关，否则跨网关名会被错误放行
    for (const name of ["gemini", "moonshot", "xai", "dashscope"]) {
      expect(byName.get(name)?.isGateway, `${name} 不应标记为 gateway`).toBeFalsy()
    }
  })

  it("直连供应商认自家模型名、拒收跨网关模型名", async () => {
    const { getProviderConfigs } = await import("@/lib/llm/config")
    const { OpenAICompatibleProvider } = await import("@/lib/llm/provider")
    const byName = new Map(getProviderConfigs().map((config) => [config.name, config]))
    const provider = (name: string) => new OpenAICompatibleProvider(byName.get(name)!)

    expect(provider("gemini").supportsModel("gemini-3.8-flash")).toBe(true)
    expect(provider("moonshot").supportsModel("kimi-k3")).toBe(true)
    expect(provider("xai").supportsModel("grok-4")).toBe(true)
    expect(provider("dashscope").supportsModel("qwen3-max")).toBe(true)

    // 跨网关名一律不认：错配会吃 400，必须留给聚合网关
    expect(provider("gemini").supportsModel("anthropic/claude-opus-4.6")).toBe(false)
    expect(provider("moonshot").supportsModel("google/gemini-3.8-flash")).toBe(false)
    expect(provider("xai").supportsModel("openai/gpt-5.4")).toBe(false)
  })

  it("Gemini / Grok 回落 APIMART 代理，专用 PROXY_URL 优先级更高", async () => {
    const { getProviderConfigs, resolveLlmProxyUrl } = await import("@/lib/llm/config")

    const configs = new Map(getProviderConfigs().map((c) => [c.name, c]))
    expect(configs.get("gemini")?.proxyURL).toBe("http://127.0.0.1:10808")
    expect(configs.get("xai")?.proxyURL).toBe("http://127.0.0.1:10808")
    // OpenRouter 的 Claude/Gemini 按出口 IP 地域封锁，必须能配代理
    expect(configs.get("openrouter")?.proxyURL).toBe("http://127.0.0.1:10808")

    // 覆盖优先级：专用 URL 在前，APIMART 仅兜底。
    // 直接测解析函数而不是重导入 env——t3-env 在模块加载期固定 runtimeEnv，
    // 同一测试进程内改 process.env 不会让已加载的 env 重新求值。
    expect(resolveLlmProxyUrl("http://127.0.0.1:9999", "http://127.0.0.1:10808")).toBe(
      "http://127.0.0.1:9999",
    )
    expect(resolveLlmProxyUrl(undefined, "http://127.0.0.1:10808")).toBe(
      "http://127.0.0.1:10808",
    )
  })

  it("新模型进入作品编辑与自由创作链路（否则等于没接）", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")

    expect(getAgentLLM("work_editor").providerNames).toEqual(
      expect.arrayContaining(["openrouter", "gemini", "moonshot"]),
    )
    expect(getAgentLLM("free_copywriter").providerNames).toEqual(
      expect.arrayContaining(["openrouter", "moonshot", "gemini", "dashscope", "xai"]),
    )
    expect(getAgentLLM("moments_copywriter").providerNames).toEqual(
      expect.arrayContaining(["openrouter", "moonshot", "gemini"]),
    )
  })

  it("跨网关模型名是实测确认过的，且每条路由只挂一个 openrouter 跳", async () => {
    const { CROSS_GATEWAY_MODELS } = await import("@/lib/llm/models")
    const { AGENT_ROUTES } = await import("@/lib/llm/agent-router")

    // 这四条由 2026-09-17 实测 OpenRouter 目录确认存在，别凭记忆改回裸名。
    expect(CROSS_GATEWAY_MODELS.claudeOpus).toBe("anthropic/claude-opus-4.6")
    expect(CROSS_GATEWAY_MODELS.geminiFlash).toBe("google/gemini-3.8-flash")
    expect(CROSS_GATEWAY_MODELS.kimiK3).toBe("moonshotai/kimi-k3")
    expect(CROSS_GATEWAY_MODELS.grok).toBe("x-ai/grok-4.6")

    // 客户端对同一 provider 只打一次（aim-model-policy「skipping same-vendor extras」），
    // 所以同一路由挂多个 openrouter 跳是无效的——这条断言防止有人这么加。
    //
    // 注：存量 content_review / content_retro 各挂了 2 个 openrouter 跳（第二个不会被调用），
    // 属于既有问题，非本次改动引入，未在本次修复，故断言只覆盖本次改动的三条路由。
    const touchedRoutes = ["work_editor", "free_copywriter", "moments_copywriter"] as const
    for (const agentId of touchedRoutes) {
      const openrouterHops = AGENT_ROUTES[agentId].filter((route) => route.name === "openrouter").length
      expect(openrouterHops, `${agentId} 挂了 ${openrouterHops} 个 openrouter 跳，超出有效上限`).toBe(1)
    }
  })

  it("质量链首跳仍是 Sonnet——Opus 未被静默换入", async () => {
    const { getAgentLLM, getAgentRecommendedModel } = await import("@/lib/llm/agent-router")

    // 断言回归护栏：新增供应商不得顺手改变内容创作的首跳模型。
    // 换 Opus 需要先过 model-swap eval 与 probe-ecs-model-routes.sh。
    expect(getAgentRecommendedModel("content_producer")).toBe("anthropic/claude-sonnet-4.6")
    expect(getAgentLLM("content_producer").providerNames[0]).toBe("zenmux")
  })
})

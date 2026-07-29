import { afterEach, describe, expect, it, vi } from "vitest"

describe("ZenMux proxy gate", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("strips quotes and picks first valid proxy URL", async () => {
    const { resolveLlmProxyUrl } = await import("@/lib/llm/config")
    expect(resolveLlmProxyUrl(undefined, '"http://127.0.0.1:10809"')).toBe(
      "http://127.0.0.1:10809",
    )
    expect(resolveLlmProxyUrl("not-a-url", "http://127.0.0.1:1")).toBe("http://127.0.0.1:1")
  })

  it("blocks ZenMux in production when proxy is missing", async () => {
    const { shouldRegisterZenMux } = await import("@/lib/llm/config")
    expect(
      shouldRegisterZenMux({
        apiKey: "sk-test",
        proxyURL: undefined,
        nodeEnv: "production",
      }),
    ).toEqual({ ok: false, reason: "production_requires_proxy" })
  })

  it("allows ZenMux in production when proxy is set", async () => {
    const { shouldRegisterZenMux } = await import("@/lib/llm/config")
    expect(
      shouldRegisterZenMux({
        apiKey: "sk-test",
        proxyURL: "http://127.0.0.1:10809",
        nodeEnv: "production",
      }),
    ).toEqual({ ok: true })
  })

  it("skips registering ZenMux without proxy under NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    process.env.ZENMUX_API_KEY = "sk-zenmux"
    delete process.env.ZENMUX_PROXY_URL
    delete process.env.APIMART_PROXY_URL
    delete process.env.ZENMUX_ALLOW_DIRECT
    process.env.DEEPSEEK_API_KEY = "sk-deepseek"
    vi.resetModules()

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { getProviderConfigs } = await import("@/lib/llm/config")
    const names = getProviderConfigs().map((c) => c.name)
    expect(names).not.toContain("zenmux")
    expect(names).toContain("deepseek")
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

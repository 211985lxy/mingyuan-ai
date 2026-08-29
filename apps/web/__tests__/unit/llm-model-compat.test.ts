import { describe, expect, it, vi } from "vitest"

import { LLMClient } from "@/lib/llm/client"
import { CROSS_GATEWAY_MODELS } from "@/lib/llm/models"
import { OpenAICompatibleProvider } from "@/lib/llm/provider"
import type { LLMProvider } from "@/lib/llm/types"

vi.mock("@/env", () => ({
  env: new Proxy(
    { NODE_ENV: "test", DEEPSEEK_API_KEY: "k-ds", ZENMUX_API_KEY: "k-zx", APIMART_API_KEY: "k-ap", LLM_MAX_PROVIDER_ATTEMPTS: "5" },
    { get: (t: Record<string, string>, k: string) => t[k] ?? "" },
  ),
}))

import { getProviderConfigs } from "@/lib/llm/config"
import { AGENT_ROUTES } from "@/lib/llm/agent-router"

describe("模型名-供应商兼容性契约", () => {
  it("AGENT_ROUTES 每条 (provider, model) 组合都合法", () => {
    const configs = new Map(getProviderConfigs().map((c) => [c.name, c]))
    const violations: string[] = []
    for (const [agentId, routes] of Object.entries(AGENT_ROUTES)) {
      for (const route of routes) {
        const config = configs.get(route.name)
        if (!config) continue // 未配置密钥的供应商不参与线上路由
        const provider = new OpenAICompatibleProvider(config)
        if (route.model && !provider.supportsModel!(route.model)) {
          violations.push(`${agentId}: ${route.name} 不认识模型 "${route.model}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("注册表的跨网关模型至少被一个已配置聚合网关认识", () => {
    const providers = getProviderConfigs().map((c) => new OpenAICompatibleProvider(c))
    const gateways = providers.filter((p) => p.isAvailable())
    for (const model of Object.values(CROSS_GATEWAY_MODELS)) {
      expect(
        gateways.some((p) => p.supportsModel!(model)),
        `没有任何供应商认识注册表模型 ${model}`,
      ).toBe(true)
    }
  })
})

describe("LLMClient 路由前过滤", () => {
  function fakeProvider(name: string, gateway: boolean): LLMProvider & { complete: ReturnType<typeof vi.fn> } {
    return {
      name,
      defaultModel: `${name}-default`,
      supportsModel(model: string) {
        if (gateway) return true
        if (model.includes("/")) return false
        return model.startsWith(name)
      },
      complete: vi.fn(async (options: { model?: string }) => ({
        content: "ok",
        model: options.model ?? `${name}-default`,
        provider: name,
      })),
      isAvailable: () => true,
    } as never
  }

  it("跨网关模型名自动跳过直连供应商，落到聚合网关", async () => {
    const deepseek = fakeProvider("deepseek", false)
    const zenmux = fakeProvider("zenmux", true)
    const client = new LLMClient([deepseek, zenmux])
    const result = await client.complete({
      model: CROSS_GATEWAY_MODELS.claudeSonnet,
      messages: [{ role: "user", content: "hi" }],
    })
    expect(deepseek.complete).not.toHaveBeenCalled()
    expect(zenmux.complete).toHaveBeenCalledOnce()
    expect(result.provider).toBe("zenmux")
  })

  it("没有任何供应商认识时给出可定位的配置错误", async () => {
    const deepseek = fakeProvider("deepseek", false)
    const client = new LLMClient([deepseek])
    await expect(
      client.complete({
        model: "openai/gpt-nonexistent",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(/\[llm-config\]/)
  })
})

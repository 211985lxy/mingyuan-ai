import { describe, expect, it, vi } from "vitest"

import { createGatewayLLM } from "@/lib/llm/gateway-client"

vi.mock("@/lib/llm/config", () => ({
  getProviderConfigs: () => [
    { name: "deepseek", apiKey: "k1" },
    { name: "apimart", apiKey: "k2" },
    { name: "glm", apiKey: "k3" },
    { name: "zenmux", apiKey: "k4" },
  ],
}))

vi.mock("@/lib/llm/provider", () => ({
  OpenAICompatibleProvider: class {
    constructor(public config: { name: string }) {}
    isAvailable() {
      return true
    }
    get name() {
      return this.config.name
    }
  },
}))

describe("createGatewayLLM", () => {
  it("只挂聚合网关并按 zenmux→apimart→openrouter 排序，排除直连供应商", () => {
    const client = createGatewayLLM()
    expect(client.providerNames).toEqual(["zenmux", "apimart"])
  })
})

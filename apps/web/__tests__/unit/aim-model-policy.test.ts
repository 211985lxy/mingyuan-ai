import { describe, expect, it } from "vitest"

import { planAimRun } from "@/lib/aim-harness/planner"
import { LLMClient } from "@/lib/llm/client"
import { classifyProviderError } from "@/lib/llm/telemetry"
import type { LLMProvider } from "@/lib/llm/types"

function successfulProvider(name: string): LLMProvider {
  return {
    name,
    defaultModel: `${name}-model`,
    isAvailable: () => true,
    async complete() {
      return { content: "ok", model: `${name}-model`, provider: name }
    },
  }
}

describe("AIM model capability policy", () => {
  it("caps streaming fallback at two attempts", () => {
    const spec = planAimRun({
      entrypoint: "chat",
      agentId: "work_editor",
      rawInput: "继续优化",
      targetFormats: [],
      messages: [{ role: "user", content: "继续优化" }],
      stream: true,
    })

    expect(spec.modelPolicy.stream).toBe(true)
    expect(spec.modelPolicy.maxProviderAttempts).toBe(2)
  })

  it("allows fallback when the requested model is unavailable", () => {
    expect(classifyProviderError(new Error("404 model not found"))).toEqual({
      kind: "model_unavailable",
      retryable: true,
    })
    expect(classifyProviderError(new Error("403 This model is not available in your region"))).toEqual({
      kind: "model_unavailable",
      retryable: true,
    })
  })

  it("treats provider balance exhaustion as retryable and falls back", async () => {
    expect(classifyProviderError(new Error("402 Insufficient Balance"))).toEqual({
      kind: "rate_limit",
      retryable: true,
    })
    expect(classifyProviderError(new Error("403 剩余额度不足"))).toEqual({
      kind: "rate_limit",
      retryable: true,
    })

    const calls: string[] = []
    const outOfBalance = (name: string): LLMProvider => ({
      name,
      defaultModel: `${name}-model`,
      isAvailable: () => true,
      async complete() {
        calls.push(name)
        throw new Error("402 Insufficient Balance")
      },
    })

    const result = await new LLMClient([
      outOfBalance("deepseek"),
      successfulProvider("apimart"),
    ]).complete({ messages: [{ role: "user", content: "test" }] })

    expect(result.provider).toBe("apimart")
    expect(calls).toEqual(["deepseek"])
  })

  it("treats an empty provider response as retryable and falls back", async () => {
    expect(classifyProviderError(new Error("[apimart] Empty response from model gpt-5"))).toEqual({
      kind: "server",
      retryable: true,
    })

    const calls: string[] = []
    const empty = (name: string): LLMProvider => ({
      name,
      defaultModel: `${name}-model`,
      isAvailable: () => true,
      async complete() {
        calls.push(name)
        throw new Error(`[${name}] Empty response from model gpt-5`)
      },
    })

    const result = await new LLMClient([
      empty("apimart"),
      successfulProvider("zenmux"),
    ]).complete({ messages: [{ role: "user", content: "test" }] })

    expect(result.provider).toBe("zenmux")
    expect(calls).toEqual(["apimart"])
  })

  it("honors a per-run provider attempt budget", async () => {
    const calls: string[] = []
    const failing = (name: string): LLMProvider => ({
      name,
      defaultModel: `${name}-model`,
      isAvailable: () => true,
      async complete() {
        calls.push(name)
        throw new Error("status 503")
      },
    })

    const result = await new LLMClient([
      failing("provider-1"),
      failing("provider-2"),
      successfulProvider("provider-3"),
    ], { maxAttempts: 3 }).complete({ messages: [{ role: "user", content: "test" }] })

    expect(result.provider).toBe("provider-3")
    expect(calls).toEqual(["provider-1", "provider-2"])
  })
})

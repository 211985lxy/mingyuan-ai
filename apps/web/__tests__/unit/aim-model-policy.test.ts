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

  it("treats Ark ModelNotOpen and SDK connection errors as fallback-able, not chain-breaking", () => {
    // 2026-09-08 事故：生产 ARK 账号未开通 doubao 模型（ModelNotOpen 404），
    // 之前按 4xx client 错误处理会中断整条降级链而不是换下一跳。
    expect(classifyProviderError(new Error(
      '404 {"error":{"code":"ModelNotOpen","message":"Your account has not activated the model doubao-seed-2-1-pro-260628."}}',
    ))).toEqual({ kind: "model_unavailable", retryable: true })

    // OpenAI 兼容 SDK 连接层错误的统一文案，必须归为 network（此前落 unknown → INTERNAL_ERROR）
    expect(classifyProviderError(new Error("Connection error."))).toEqual({
      kind: "network",
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

  it("gives content production and diagnosis a 115s budget and three distinct providers", () => {
    const spoken = planAimRun({
      entrypoint: "generate",
      agentId: "content_producer",
      rawInput: "写一条口播，写给实体店老板，目标获客",
      targetFormats: ["video_script"],
      runtimeTask: "new_copy",
    })
    expect(spoken.modelPolicy.maxProviderAttempts).toBe(4)
    expect(spoken.modelPolicy.totalTimeoutMs).toBe(115_000)
    expect(spoken.executionPolicy.timeoutMs).toBe(115_000)

    const diagnosis = planAimRun({
      entrypoint: "generate",
      agentId: "business_diagnosis",
      rawInput: "诊断一下当前获客链路",
      targetFormats: ["raw_copy"],
    })
    expect(diagnosis.modelPolicy.maxProviderAttempts).toBe(4)
    expect(diagnosis.modelPolicy.totalTimeoutMs).toBe(115_000)
  })

  it("counts actual provider requests, skipping same-vendor extras and incompatible models", async () => {
    const calls: string[] = []
    const failing = (name: string, model = `${name}-model`): LLMProvider => ({
      name,
      defaultModel: model,
      isAvailable: () => true,
      async complete() {
        calls.push(`${name}:${model}`)
        throw new Error("status 504 timeout")
      },
    })
    const success = (name: string): LLMProvider => ({
      name,
      defaultModel: `${name}-model`,
      isAvailable: () => true,
      async complete() {
        calls.push(name)
        return { content: "ok", model: `${name}-model`, provider: name }
      },
    })

    const result = await new LLMClient([
      failing("zenmux"),
      failing("deepseek", "deepseek-v4-pro"),
      failing("deepseek", "deepseek-v4-flash"),
      success("apimart"),
    ], { maxAttempts: 3 }).complete({ messages: [{ role: "user", content: "test" }] })

    expect(result.provider).toBe("apimart")
    expect(calls.filter((name) => name.startsWith("deepseek")).length).toBeLessThanOrEqual(1)
    expect(calls).toContain("apimart")

    calls.length = 0
    const skipped = await new LLMClient([
      {
        name: "glm",
        defaultModel: "glm-5.1",
        isAvailable: () => true,
        supportsModel: () => false,
        async complete() {
          calls.push("glm")
          throw new Error("should not run")
        },
      },
      failing("zenmux"),
      success("apimart"),
    ], { maxAttempts: 2 }).complete({
      messages: [{ role: "user", content: "test" }],
      model: "incompatible/model",
    })
    expect(calls).toEqual(["zenmux:zenmux-model", "apimart"])
    expect(skipped.provider).toBe("apimart")
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import type { CompletionOptions, LLMProvider } from "@/lib/llm/types"

const originalAttempts = process.env.LLM_MAX_PROVIDER_ATTEMPTS
const originalOutputTokens = process.env.LLM_MAX_OUTPUT_TOKENS

afterEach(() => {
  process.env.LLM_MAX_PROVIDER_ATTEMPTS = originalAttempts
  process.env.LLM_MAX_OUTPUT_TOKENS = originalOutputTokens
  vi.resetModules()
})

describe("LLM client bounds", () => {
  it("uses safe defaults when environment limits are invalid", async () => {
    process.env.LLM_MAX_PROVIDER_ATTEMPTS = "not-a-number"
    process.env.LLM_MAX_OUTPUT_TOKENS = "not-a-number"
    vi.resetModules()
    const { LLMClient } = await import("@/lib/llm/client")
    const calls: string[] = []
    const failedProvider: LLMProvider = {
      name: "first",
      defaultModel: "first-model",
      isAvailable: () => true,
      async complete() {
        calls.push("first")
        throw new Error("503 unavailable")
      },
    }
    const fallbackProvider: LLMProvider = {
      name: "second",
      defaultModel: "second-model",
      isAvailable: () => true,
      async complete(options) {
        calls.push("second")
        expect(options.maxTokens).toBe(8192)
        return { content: "ok", model: "second-model", provider: "second" }
      },
    }

    const result = await new LLMClient([failedProvider, fallbackProvider]).complete({
      messages: [{ role: "user", content: "test" }],
    })

    expect(result.provider).toBe("second")
    expect(calls).toEqual(["first", "second"])
  })

  it("falls back when the first provider streams zero chunks", async () => {
    vi.resetModules()
    const { LLMClient } = await import("@/lib/llm/client")
    const calls: string[] = []
    const emptyStreamer: LLMProvider = {
      name: "empty",
      defaultModel: "empty-model",
      isAvailable: () => true,
      async complete() {
        throw new Error("complete should not run")
      },
      async *stream() {
        calls.push("empty")
        // 故意不 yield：模拟 DeepSeek 空 content 流
      },
    }
    const fallbackStreamer: LLMProvider = {
      name: "fallback",
      defaultModel: "fallback-model",
      isAvailable: () => true,
      async complete() {
        throw new Error("complete should not run")
      },
      async *stream() {
        calls.push("fallback")
        yield "成稿"
      },
    }

    const chunks: string[] = []
    for await (const chunk of new LLMClient([emptyStreamer, fallbackStreamer]).stream({
      messages: [{ role: "user", content: "写口播" }],
    })) {
      chunks.push(chunk)
    }

    expect(calls).toEqual(["empty", "fallback"])
    expect(chunks.join("")).toBe("成稿")
  })
})

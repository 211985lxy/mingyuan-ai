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

  it("replaces invalid per-request token limits with the configured cap", async () => {
    process.env.LLM_MAX_OUTPUT_TOKENS = "512"
    vi.resetModules()
    const { LLMClient } = await import("@/lib/llm/client")
    const provider: LLMProvider = {
      name: "provider",
      defaultModel: "provider-model",
      isAvailable: () => true,
      async complete(options: CompletionOptions) {
        expect(options.maxTokens).toBe(512)
        return { content: "ok", model: "provider-model", provider: "provider" }
      },
    }

    await new LLMClient([provider]).complete({
      messages: [{ role: "user", content: "test" }],
      maxTokens: Number.NaN,
    })
  })
})

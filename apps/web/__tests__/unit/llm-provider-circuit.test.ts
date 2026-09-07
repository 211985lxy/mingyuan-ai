import { afterEach, describe, expect, it } from "vitest"

import { LLMClient } from "@/lib/llm/client"
import {
  createProviderCircuit,
  isProviderCircuitOpen,
  recordProviderCircuitFailure,
  recordProviderCircuitSuccess,
  resetProviderCircuitForTests,
  summarizeAimRouteProbe,
  type ProviderCircuitStore,
} from "@/lib/llm/provider-circuit"
import type { LLMProvider } from "@/lib/llm/types"

const FIVE_MIN = 5 * 60 * 1000

function memoryStore(): ProviderCircuitStore {
  const data = new Map<string, string>()
  return {
    async get(key) {
      return data.get(key) ?? null
    },
    async set(key, value) {
      data.set(key, value)
    },
    async del(key) {
      data.delete(key)
    },
  }
}

function throwingStore(): ProviderCircuitStore {
  return {
    async get() {
      throw new Error("ECONNREFUSED redis")
    },
    async set() {
      throw new Error("ECONNREFUSED redis")
    },
    async del() {
      throw new Error("ECONNREFUSED redis")
    },
  }
}

afterEach(() => {
  resetProviderCircuitForTests()
})

describe("provider circuit", () => {
  it("opens for 5 minutes after two retryable failures in the window", async () => {
    let now = 1_000_000
    const circuit = createProviderCircuit({ now: () => now, store: memoryStore() })
    await circuit.recordFailure("zenmux", "anthropic/claude-sonnet-4.6", "timeout")
    expect(await circuit.isOpen("zenmux", "anthropic/claude-sonnet-4.6")).toBe(false)
    await circuit.recordFailure("zenmux", "anthropic/claude-sonnet-4.6", "empty_response")
    expect(await circuit.isOpen("zenmux", "anthropic/claude-sonnet-4.6")).toBe(true)
    now += FIVE_MIN - 1
    expect(await circuit.isOpen("zenmux", "anthropic/claude-sonnet-4.6")).toBe(true)
    expect(await circuit.isOpen("zenmux", "other-model")).toBe(false)
  })

  it("opens for 15 minutes after a single auth or balance failure", async () => {
    const circuit = createProviderCircuit({ now: () => 2_000_000, store: memoryStore() })
    await circuit.recordFailure("glm", "glm-5.1", "auth")
    expect(await circuit.isOpen("glm", "glm-5.1")).toBe(true)
    const other = createProviderCircuit({ now: () => 3_000_000, store: memoryStore() })
    await other.recordFailure("apimart", "gpt-5.4", "balance")
    expect(await other.isOpen("apimart", "gpt-5.4")).toBe(true)
  })

  it("resets consecutive failures after a success", async () => {
    const circuit = createProviderCircuit({ now: () => 4_000_000, store: memoryStore() })
    await circuit.recordFailure("zenmux", "claude", "timeout")
    await circuit.recordSuccess("zenmux", "claude")
    await circuit.recordFailure("zenmux", "claude", "timeout")
    expect(await circuit.isOpen("zenmux", "claude")).toBe(false)
  })

  it("falls back to process memory when Redis throws", async () => {
    const circuit = createProviderCircuit({ now: () => 5_000_000, store: throwingStore() })
    await circuit.recordFailure("glm", "glm-5.1", "timeout")
    await circuit.recordFailure("glm", "glm-5.1", "network")
    expect(await circuit.isOpen("glm", "glm-5.1")).toBe(true)
  })

  it("allows a single half-open probe after TTL and reopens on failure", async () => {
    let now = 6_000_000
    const circuit = createProviderCircuit({ now: () => now, store: memoryStore() })
    await circuit.recordFailure("apimart", "gpt-5.4", "server")
    await circuit.recordFailure("apimart", "gpt-5.4", "server")
    expect(await circuit.isOpen("apimart", "gpt-5.4")).toBe(true)
    now += FIVE_MIN + 1
    expect(await circuit.isOpen("apimart", "gpt-5.4")).toBe(false)
    expect(await circuit.isOpen("apimart", "gpt-5.4")).toBe(true)
    await circuit.recordFailure("apimart", "gpt-5.4", "timeout")
    expect(await circuit.isOpen("apimart", "gpt-5.4")).toBe(true)
  })

  it("does not consume a provider attempt for an open circuit candidate", async () => {
    await recordProviderCircuitFailure("blocked", "blocked-model", "auth")
    expect(await isProviderCircuitOpen("blocked", "blocked-model")).toBe(true)
    const calls: string[] = []
    const blocked: LLMProvider = {
      name: "blocked",
      defaultModel: "blocked-model",
      isAvailable: () => true,
      async complete() {
        calls.push("blocked")
        throw new Error("should not run")
      },
    }
    const first: LLMProvider = {
      name: "first",
      defaultModel: "first-model",
      isAvailable: () => true,
      async complete() {
        calls.push("first")
        throw new Error("503 unavailable")
      },
    }
    const second: LLMProvider = {
      name: "second",
      defaultModel: "second-model",
      isAvailable: () => true,
      async complete() {
        calls.push("second")
        return { content: "ok", model: "second-model", provider: "second" }
      },
    }
    const result = await new LLMClient([blocked, first, second], { maxAttempts: 2 }).complete({
      messages: [{ role: "user", content: "test" }],
    })
    expect(result.provider).toBe("second")
    expect(calls).toEqual(["first", "second"])
    await recordProviderCircuitSuccess("second", "second-model")
  })
})

describe("aim route probe summary", () => {
  it("fails when the primary or either backup is not healthy", () => {
    expect(summarizeAimRouteProbe([
      { name: "zenmux", model: "anthropic/claude-sonnet-4.6", status: "healthy", durationMs: 12 },
      { name: "glm", model: "glm-5.1", status: "unconfigured" },
      { name: "apimart", model: "gpt-5.4", status: "healthy", durationMs: 20 },
    ]).ok).toBe(false)
    expect(summarizeAimRouteProbe([
      { name: "zenmux", model: "anthropic/claude-sonnet-4.6", status: "failed", durationMs: 8 },
      { name: "glm", model: "glm-5.1", status: "healthy", durationMs: 9 },
      { name: "apimart", model: "gpt-5.4", status: "healthy", durationMs: 10 },
    ]).ok).toBe(false)
    expect(summarizeAimRouteProbe([
      { name: "zenmux", model: "anthropic/claude-sonnet-4.6", status: "healthy", durationMs: 12 },
      { name: "glm", model: "glm-5.1", status: "healthy", durationMs: 9 },
      { name: "apimart", model: "gpt-5.4", status: "healthy", durationMs: 10 },
      { name: "deepseek", model: "deepseek-v4-pro", status: "failed", durationMs: 4 },
    ]).ok).toBe(true)
  })
})

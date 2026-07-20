import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  eval: vi.fn(),
}))

vi.mock("@/env", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }))
vi.mock("@/lib/redis", () => ({ redis: { eval: mocks.eval } }))

import { allowChannelMessage } from "@/lib/channel-rate-limiter"

describe("allowChannelMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows when under the rate limit (Redis returns 0)", async () => {
    mocks.eval.mockResolvedValue(0)
    const result = await allowChannelMessage({ platform: "feishu", externalChatId: "chat-1" })
    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
  })

  it("rejects when rate limited (Redis returns 1)", async () => {
    mocks.eval.mockResolvedValue(1)
    const result = await allowChannelMessage({ platform: "feishu", externalChatId: "chat-1" })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBe(60_000)
  })

  it("allows when Redis is unavailable (graceful degradation)", async () => {
    mocks.eval.mockRejectedValue(new Error("Connection refused"))
    const result = await allowChannelMessage({ platform: "feishu", externalChatId: "chat-1" })
    expect(result.allowed).toBe(true)
  })

  it("allows when REDIS_URL is not set", async () => {
    const { env } = await import("@/env")
    const originalUrl = env.REDIS_URL
    vi.doMock("@/env", () => ({ env: { ...env, REDIS_URL: undefined } }))
    const { allowChannelMessage: allowNoRedis } = await import("@/lib/channel-rate-limiter")
    const result = await allowNoRedis({ platform: "wecom", externalChatId: "chat-2" })
    expect(result.allowed).toBe(true)
    // Note: can't easily unmock, but this validates the fallback path
  })

  it("uses custom limit and window when provided", async () => {
    mocks.eval.mockResolvedValue(0)
    const result = await allowChannelMessage({
      platform: "feishu",
      externalChatId: "chat-1",
      limit: 3,
      windowMs: 30_000,
    })
    expect(result.allowed).toBe(true)
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.any(String), 1, expect.stringContaining("chat-1"),
      "30000", "3", expect.any(String),
    )
  })

  it("includes externalAccountId in the Redis key", async () => {
    mocks.eval.mockResolvedValue(0)
    await allowChannelMessage({ platform: "wecom", externalChatId: "chat-1", externalAccountId: "corp-123" })
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.any(String), 1, expect.stringContaining("corp-123:chat-1"),
      expect.anything(), expect.anything(), expect.anything(),
    )
  })
})

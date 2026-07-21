import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock redis module
const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([1, 1]),
}
vi.mock("@/lib/redis", () => ({
  redis: {
    pipeline: () => mockPipeline,
    mget: vi.fn().mockResolvedValue([]),
  },
}))

describe("recordChannelMetric", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPipeline.exec.mockResolvedValue([1, 1])
  })

  it("increments counters via Redis pipeline (global + account + channel)", async () => {
    const { recordChannelMetric } = await import("@/lib/channel-metrics")
    await recordChannelMetric({ metric: "received", platform: "feishu", externalChatId: "oc_test" })

    // 3 incr calls: global, per-account, per-channel
    expect(mockPipeline.incr).toHaveBeenCalledTimes(3)
    // 3 expire calls (one per key)
    expect(mockPipeline.expire).toHaveBeenCalledTimes(3)
    expect(mockPipeline.exec).toHaveBeenCalled()
  })

  it("increments global + account counter when no chatId", async () => {
    const { recordChannelMetric } = await import("@/lib/channel-metrics")
    await recordChannelMetric({ metric: "received", platform: "feishu" })

    // 2 incr calls: global, per-account
    expect(mockPipeline.incr).toHaveBeenCalledTimes(2)
    // 2 expire calls
    expect(mockPipeline.expire).toHaveBeenCalledTimes(2)
  })

  it("does not throw when Redis is unavailable", async () => {
    mockPipeline.exec.mockRejectedValue(new Error("Connection refused"))
    const { recordChannelMetric } = await import("@/lib/channel-metrics")

    // Should not throw
    await expect(recordChannelMetric({ metric: "received", platform: "feishu" })).resolves.toBeUndefined()
  })
})

describe("getChannelMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns zero summary when Redis mget returns empty", async () => {
    const redis = (await import("@/lib/redis")).redis
    vi.mocked(redis).mget.mockResolvedValue([])

    const { getChannelMetrics } = await import("@/lib/channel-metrics")
    const summary = await getChannelMetrics({
      platform: "feishu",
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    })

    expect(summary.total.received).toBe(0)
    expect(summary.duplicateRate).toBe(0)
    expect(summary.pipelineSuccessRate).toBe(0)
    expect(summary.replySuccessRate).toBe(0)
    // 7 days ago to today (inclusive) = 8 days
    expect(summary.days).toHaveLength(8)
  })

  it("aggregates values from Redis mget", async () => {
    const redis = (await import("@/lib/redis")).redis
    // Mock mget to return values for the 9 metrics * 1 day = 9 values
    vi.mocked(redis).mget.mockResolvedValue(["10", "2", "1", "0", "10", "8", "2", "8", "0"])

    const { getChannelMetrics } = await import("@/lib/channel-metrics")
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const summary = await getChannelMetrics({
      platform: "feishu",
      since: yesterday,
      until: new Date(),
    })

    expect(summary.total.received).toBe(10)
    expect(summary.total.duplicate).toBe(2)
    expect(summary.duplicateRate).toBeCloseTo(0.2)
    expect(summary.total.pipeline_completed).toBe(8)
    expect(summary.total.pipeline_failed).toBe(2)
    expect(summary.pipelineSuccessRate).toBeCloseTo(8 / 10)
  })

  it("returns zero summary when Redis throws", async () => {
    const redis = (await import("@/lib/redis")).redis
    vi.mocked(redis).mget.mockRejectedValue(new Error("Connection refused"))

    const { getChannelMetrics } = await import("@/lib/channel-metrics")
    const summary = await getChannelMetrics({
      platform: "feishu",
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })

    expect(summary.total.received).toBe(0)
  })
})

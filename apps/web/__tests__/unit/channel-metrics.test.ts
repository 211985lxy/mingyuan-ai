import { describe, expect, it, vi, beforeEach } from "vitest"
import { CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES } from "@/lib/aim-harness/content-rollout-gate"

// Mock redis module
const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([1, 1]),
}
const mockFindMany = vi.fn().mockResolvedValue([])

vi.mock("@/lib/redis", () => ({
  redis: {
    pipeline: () => mockPipeline,
    mget: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspiration: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

describe("recordChannelMetric", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPipeline.exec.mockResolvedValue([1, 1])
    mockFindMany.mockResolvedValue([])
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
    mockFindMany.mockResolvedValue([])
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
    expect(summary.shadowSamples).toEqual({
      total: 0,
      byMode: { capture_only: 0, evaluate: 0 },
      remainingToGate: CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES,
      invalidCount: 0,
      formalWriteViolationCount: 0,
      replyViolationCount: 0,
    })
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
    expect(summary.shadowSamples.total).toBe(0)
  })

  it("loads shadowSamples from Inspiration with platform and window filters", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "a",
        source: "feishu",
        sourceUrl: null,
        externalMessageId: "om_a",
        dedupeKey: null,
        executionModeSnapshot: "capture_only",
        topicSelectionId: null,
        replyStatus: "suppressed",
        createdAt: new Date(),
      },
      {
        id: "b",
        source: "feishu",
        sourceUrl: null,
        externalMessageId: "om_b",
        dedupeKey: null,
        executionModeSnapshot: "evaluate",
        topicSelectionId: null,
        replyStatus: "suppressed",
        createdAt: new Date(),
      },
      {
        id: "c",
        source: "feishu",
        sourceUrl: null,
        externalMessageId: "om_c",
        dedupeKey: null,
        executionModeSnapshot: null,
        topicSelectionId: null,
        replyStatus: "suppressed",
        createdAt: new Date(),
      },
    ])

    const { getChannelMetrics } = await import("@/lib/channel-metrics")
    const since = new Date("2026-07-01T00:00:00.000Z")
    const until = new Date("2026-07-10T00:00:00.000Z")
    const summary = await getChannelMetrics({
      platform: "feishu",
      since,
      until,
    })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10_001,
        where: expect.objectContaining({
          source: "feishu",
          createdAt: { gte: since, lte: until },
        }),
      }),
    )
    expect(summary.shadowSamples.total).toBe(2)
    expect(summary.shadowSamples.byMode).toEqual({ capture_only: 1, evaluate: 1 })
    expect(summary.shadowSamples.invalidCount).toBe(1)
    expect(summary.shadowSamples.remainingToGate).toBe(CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES - 2)
  })

  it("returns zero shadowSamples when Inspiration query throws", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"))
    const { getChannelMetrics } = await import("@/lib/channel-metrics")
    const summary = await getChannelMetrics({
      platform: "feishu",
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })
    expect(summary.shadowSamples.total).toBe(0)
    expect(summary.shadowSamples.remainingToGate).toBe(CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES)
  })

  it("查询达到边界时不输出截断后的错误影子样本统计", async () => {
    mockFindMany.mockResolvedValue(Array.from({ length: 10_001 }, (_, index) => ({
      id: `sample_${index}`,
      source: "feishu",
      sourceUrl: null,
      externalMessageId: `message_${index}`,
      dedupeKey: null,
      executionModeSnapshot: "capture_only",
      topicSelectionId: null,
      replyStatus: "suppressed",
      createdAt: new Date(),
    })))
    const { getChannelMetrics } = await import("@/lib/channel-metrics")
    const summary = await getChannelMetrics({
      platform: "feishu",
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })
    expect(summary.shadowSamples.total).toBe(0)
    expect(summary.shadowSamples.remainingToGate).toBe(CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES)
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const { dailyUpsert, mget, pipelineExec } = vi.hoisted(() => ({
  dailyUpsert: vi.fn(),
  mget: vi.fn(),
  pipelineExec: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { channelMetricDaily: { upsert: dailyUpsert, findMany: vi.fn() } },
}))
vi.mock("@/lib/redis", () => ({
  redis: {
    pipeline: () => ({ incr: vi.fn().mockReturnThis(), expire: vi.fn().mockReturnThis(), exec: pipelineExec }),
    mget,
  },
}))
vi.mock("@/lib/metrics", () => ({ channelMetricRollupFailuresTotal: { inc: vi.fn() } }))

import { recordChannelMetric, rollupChannelMetricDay } from "@/lib/channel-metrics"

describe("durable channel metrics", () => {
  beforeEach(() => {
    dailyUpsert.mockReset()
    mget.mockReset()
    pipelineExec.mockReset()
    dailyUpsert.mockResolvedValue({})
    pipelineExec.mockResolvedValue([])
  })

  it("persists an event using the Shanghai calendar day", async () => {
    await recordChannelMetric({ metric: "received", platform: "feishu", timestamp: new Date("2026-09-09T16:30:00.000Z") })
    expect(dailyUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { day_platform_metric: { day: "2026-09-10", platform: "feishu", metric: "received" } },
      update: { count: { increment: 1 } },
    }))
  })

  it("reconciles a bounded Redis day into exact durable counts", async () => {
    mget.mockResolvedValue(Array.from({ length: 9 }, (_, index) => String(index + 1)))
    const result = await rollupChannelMetricDay("2026-09-10", "feishu")
    expect(result).toEqual({ written: 9, failed: 0 })
    expect(dailyUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { count: 1 },
    }))
  })
})

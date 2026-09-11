import { beforeEach, describe, expect, it, vi } from "vitest"

const { traceFindMany, channelFindMany, loadReviewMetricsSnapshot } = vi.hoisted(() => ({
  traceFindMany: vi.fn(),
  channelFindMany: vi.fn(),
  loadReviewMetricsSnapshot: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: { findMany: traceFindMany },
    aimRunEvent: { findMany: vi.fn().mockResolvedValue([]) },
    channelMetricDaily: { findMany: channelFindMany },
  },
}))
vi.mock("@/lib/aim/review-cycle-metrics", () => ({ loadReviewMetricsSnapshot }))
vi.mock("@/lib/metrics", () => ({ statisticsQueryFailuresTotal: { inc: vi.fn() } }))

import { loadStatisticsOverview } from "@/lib/statistics-center"

const range = {
  from: "2026-09-01",
  to: "2026-09-07",
  start: new Date("2026-08-31T16:00:00.000Z"),
  end: new Date("2026-09-07T16:00:00.000Z"),
}

const snapshot = {
  publishedCount: 2, qualifiedLeadCount: 1, appointmentCount: 1, dealCount: 1, revenue: 100,
  paymentCount: 1, paymentAmountCny: null, customerOutcomeCount: 1, timeSavedMinutes: 20,
  firstPassAcceptanceRate: 0.5, rewriteRate: 0.25, rejectionRate: 0.25, directCostPerSuccess: 2,
  fullyLoadedCost: 3, p0FailureCount: 0, p1FailureCount: 1, humanTakeoverCount: 0,
  highCostAnomalyCount: 0, pendingKnowledgeCandidates: 0, pendingCaseCandidates: 0,
  pendingMemoryCandidates: 0, pendingEvalCandidates: 0, pendingMethodologyCandidates: 0,
  previousActionCloseRate: null, day7BackfillRate: 1,
}

describe("statistics center", () => {
  beforeEach(() => {
    traceFindMany.mockReset()
    channelFindMany.mockReset()
    loadReviewMetricsSnapshot.mockReset()
    traceFindMany.mockResolvedValue([
      { id: "t1", runId: "r1", projectId: "p1", agentId: "a1", status: "success", durationMs: 100, totalTokens: 10, costCny: 1, createdAt: new Date("2026-09-02T00:00:00Z"), updatedAt: new Date("2026-09-02T00:01:00Z"), aimGenerationId: "g1" },
      { id: "t2", runId: "r2", projectId: "p1", agentId: "a1", status: "failed", durationMs: 300, totalTokens: 20, costCny: 2, createdAt: new Date("2026-09-03T00:00:00Z"), updatedAt: new Date("2026-09-03T00:01:00Z"), aimGenerationId: null },
      { id: "t3", runId: null, projectId: "p1", agentId: "a1", status: "running", durationMs: null, totalTokens: null, costCny: null, createdAt: new Date("2026-09-04T00:00:00Z"), updatedAt: new Date("2026-09-04T00:00:00Z"), aimGenerationId: null },
    ])
    channelFindMany.mockResolvedValue([{ day: "2026-09-02", platform: "feishu", metric: "received", count: 4 }])
    loadReviewMetricsSnapshot.mockResolvedValue(snapshot)
  })

  it("returns operations, business, channel days, coverage, and null-safe comparisons", async () => {
    const result = await loadStatisticsOverview({ range, filters: { from: range.from, to: range.to }, now: new Date("2026-09-10T00:00:00Z") })
    expect(result.operations).toMatchObject({ runCount: 3, successCount: 1, failedCount: 1, staleRunningCount: 1, successRate: 0.5, p50DurationMs: 100, p95DurationMs: 300, totalTokens: null, totalCostCny: null })
    expect(result.operations.coverage).toMatchObject({ available: 2, total: 3, ratio: 2 / 3 })
    expect(result.business).toEqual(snapshot)
    expect(result.channels.total["feishu.received"]).toBe(4)
    expect(result.channels.days.map((day) => day.day)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"])
    expect(result.dailyTrend.find((day) => day.day === "2026-09-02")).toMatchObject({
      operations: { runCount: 1, successCount: 1, failedCount: 0, successRate: 1 },
    })
    expect(result.dailyTrend.find((day) => day.day === "2026-09-02")?.channels).toEqual({ "feishu.received": 4 })
    expect(result.comparison.dealCount).toMatchObject({ current: 1, previous: 1, delta: 0, rate: 0 })
  })

  it("marks a failed source as degraded instead of fabricating zeros", async () => {
    traceFindMany.mockRejectedValue(new Error("db down"))
    loadReviewMetricsSnapshot.mockRejectedValue(new Error("metrics down"))
    const result = await loadStatisticsOverview({ range, filters: { from: range.from, to: range.to } })
    expect(result.degradedSources).toEqual(expect.arrayContaining(["aim_execution_trace", "review_metrics"]))
    expect(result.operations).toMatchObject({ runCount: null, successCount: null, failedCount: null, coverage: { available: null, total: null, ratio: null } })
    expect(result.business).toBeNull()
    expect(result.dailyTrend.every((day) => day.operations.runCount === null)).toBe(true)
  })
})

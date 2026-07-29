import { describe, expect, it } from "vitest"
import { aggregateRunOutcomeMetrics } from "@/lib/aim/run-outcome-metrics"

function outcome(
  runId: string,
  finalDisposition: "accepted_first_pass" | "accepted_after_edit" | "rewrite_requested" | "rejected",
  overrides: Record<string, unknown> = {},
  createdAt = `2026-07-01T00:0${runId.slice(-1)}:00Z`,
) {
  return {
    runId,
    event: "final_disposition",
    createdAt: new Date(createdAt),
    metadata: {
      workflowId: "content-growth-v1",
      taskType: "write_script",
      finalDisposition,
      humanActiveMinutes: 10,
      manualBaselineMinutes: 30,
      channel: "web",
      requestId: `req-${runId}-${finalDisposition}`,
      ...overrides,
    },
  }
}

describe("aggregateRunOutcomeMetrics", () => {
  it("按 run 最新终态聚合，重写历史保留且成本不重复", () => {
    const metrics = aggregateRunOutcomeMetrics({
      events: [
        outcome("run_1", "rewrite_requested"),
        { runId: "run_1", event: "edited", metadata: null, createdAt: new Date("2026-07-01T00:02:00Z") },
        outcome("run_1", "accepted_first_pass", { humanActiveMinutes: 15 }, "2026-07-01T00:03:00Z"),
        outcome("run_2", "rejected"),
        { runId: "run_3", event: "accepted", metadata: null, createdAt: new Date("2026-07-01T00:03:00Z") },
      ],
      traces: [
        { runId: "run_1", durationMs: 1000, costCny: 2, createdAt: new Date() },
        { runId: "run_2", durationMs: 2000, costCny: { toString: () => "3.5" }, createdAt: new Date() },
        { runId: "run_3", durationMs: null, costCny: null, createdAt: new Date() },
      ],
      humanHourlyCostCny: 120,
    })

    expect(metrics.reviewedCount).toBe(2)
    expect(metrics.acceptedCount).toBe(1)
    expect(metrics.firstPassAcceptedCount).toBe(0)
    expect(metrics.rewriteCount).toBe(1)
    expect(metrics.rejectedCount).toBe(1)
    expect(metrics.unknownCount).toBe(1)
    expect(metrics.timeSavedMinutes).toBe(35)
    expect(metrics.aiDirectCostCny).toBe(5.5)
    expect(metrics.fullyLoadedCostCny).toBe(55.5)
    expect(metrics.coverage.duration).toBeCloseTo(2 / 3)
    expect(metrics.coverage.cost).toBeCloseTo(2 / 3)
  })

  it("节省时间可为负，筛选不把无匹配 trace 混入", () => {
    const metrics = aggregateRunOutcomeMetrics({
      events: [outcome("run_1", "accepted_first_pass", {
        humanActiveMinutes: 45,
        manualBaselineMinutes: 30,
        channel: "api",
      })],
      traces: [
        { runId: "run_1", durationMs: 1, costCny: 1, createdAt: new Date() },
        { runId: "run_2", durationMs: 1, costCny: 99, createdAt: new Date() },
      ],
      filters: { channel: "api" },
      humanHourlyCostCny: 0,
    })
    expect(metrics.timeSavedMinutes).toBe(-15)
    expect(metrics.runCount).toBe(1)
    expect(metrics.aiDirectCostCny).toBe(1)
  })
})

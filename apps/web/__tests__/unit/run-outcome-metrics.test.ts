import { describe, expect, it } from "vitest"
import { aggregateRunOutcomeMetrics } from "@/lib/aim/run-outcome-metrics"

function outcome(
  runId: string,
  finalDisposition: "accepted_first_pass" | "accepted_after_edit" | "rewrite_requested" | "rejected",
  overrides: Record<string, unknown> = {},
  createdAt = `2026-07-01T00:0${runId.slice(-1)}:00Z`,
) {
  return {
    id: `event-${runId}-${createdAt}`,
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

function trace(
  runId: string | null,
  costCny: unknown,
  overrides: Partial<{
    id: string
    durationMs: number | null
    createdAt: Date
    updatedAt: Date
  }> = {},
) {
  return {
    id: overrides.id ?? `trace-${runId ?? "missing"}`,
    runId,
    durationMs: overrides.durationMs === undefined ? 1000 : overrides.durationMs,
    costCny,
    createdAt: overrides.createdAt ?? new Date("2026-07-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-07-01T00:01:00Z"),
  }
}

describe("aggregateRunOutcomeMetrics", () => {
  it("按 run 最新终态聚合，重写历史保留且成本不重复", () => {
    const metrics = aggregateRunOutcomeMetrics({
      events: [
        outcome("run_1", "rewrite_requested"),
        { id: "edit-1", runId: "run_1", event: "edited", metadata: null, createdAt: new Date("2026-07-01T00:02:00Z") },
        outcome("run_1", "accepted_first_pass", { humanActiveMinutes: 15 }, "2026-07-01T00:03:00Z"),
        outcome("run_2", "rejected"),
        { id: "legacy-3", runId: "run_3", event: "accepted", metadata: null, createdAt: new Date("2026-07-01T00:03:00Z") },
      ],
      traces: [
        trace("run_1", 2),
        trace("run_2", { toString: () => "3.5" }, { durationMs: 2000 }),
        trace("run_3", null, { durationMs: null }),
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
        trace("run_1", 1, { durationMs: 1 }),
        trace("run_2", 99, { durationMs: 1 }),
      ],
      filters: { channel: "api" },
      humanHourlyCostCny: 0,
    })
    expect(metrics.timeSavedMinutes).toBe(-15)
    expect(metrics.runCount).toBe(1)
    expect(metrics.aiDirectCostCny).toBe(1)
  })

  it("排除 event-only，trace-only 计为 unknown，所有分母使用同一 run universe", () => {
    const metrics = aggregateRunOutcomeMetrics({
      events: [
        outcome("run_trace", "accepted_first_pass"),
        outcome("run_event_only", "accepted_first_pass"),
      ],
      traces: [
        trace("run_trace", 4),
        trace("run_trace_only", 6),
      ],
      humanHourlyCostCny: 0,
    })
    expect(metrics.runCount).toBe(2)
    expect(metrics.acceptedCount).toBe(1)
    expect(metrics.unknownCount).toBe(1)
    expect(metrics.aiDirectCostCny).toBe(10)
    expect(metrics.directCostPerSuccessfulTaskCny).toBe(10)
    expect(metrics.coverage.finalDisposition).toBe(0.5)
  })

  it("跨周期终态由调用方读入后仍归属于周期 trace universe", () => {
    const metrics = aggregateRunOutcomeMetrics({
      events: [
        outcome(
          "run_period",
          "accepted_after_edit",
          {},
          "2026-08-15T00:00:00Z",
        ),
      ],
      traces: [trace("run_period", 3)],
      humanHourlyCostCny: 0,
    })
    expect(metrics.runCount).toBe(1)
    expect(metrics.acceptedCount).toBe(1)
    expect(metrics.coverage.finalDisposition).toBe(1)
  })

  it("重复 trace 确定选择最近完成记录，不重复成本", () => {
    const metrics = aggregateRunOutcomeMetrics({
      events: [outcome("run_duplicate", "accepted_first_pass")],
      traces: [
        trace("run_duplicate", 2, {
          id: "trace-old",
          durationMs: null,
          updatedAt: new Date("2026-07-01T00:01:00Z"),
        }),
        trace("run_duplicate", 7, {
          id: "trace-new",
          durationMs: 700,
          updatedAt: new Date("2026-07-01T00:02:00Z"),
        }),
      ],
      humanHourlyCostCny: 0,
    })
    expect(metrics.runCount).toBe(1)
    expect(metrics.aiDirectCostCny).toBe(7)
    expect(metrics.coverage.duration).toBe(1)
    expect(metrics.coverage.cost).toBe(1)
  })

  it("筛选只匹配 latest structured outcome 且不引入 event-only run", () => {
    const metrics = aggregateRunOutcomeMetrics({
      events: [
        outcome("run_changed", "accepted_first_pass", {
          workflowId: "workflow-old",
        }, "2026-07-01T00:01:00Z"),
        outcome("run_changed", "rejected", {
          workflowId: "workflow-new",
        }, "2026-07-01T00:02:00Z"),
        outcome("run_event_only", "accepted_first_pass", {
          workflowId: "workflow-old",
        }),
      ],
      traces: [trace("run_changed", 5)],
      filters: { workflowId: "workflow-old" },
      humanHourlyCostCny: 0,
    })
    expect(metrics.runCount).toBe(0)
    expect(metrics.acceptedCount).toBe(0)
    expect(metrics.aiDirectCostCny).toBe(0)
  })
})

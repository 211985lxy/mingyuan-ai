import { describe, expect, it } from "vitest"
import {
  computeAcceptanceRate,
  computeDirectCostPerSuccess,
  computeFirstPassAcceptanceRate,
  computeFullyLoadedCost,
  computeRewriteRate,
  computeTimeSavedMinutes,
  isAcceptedDisposition,
  parseRunOutcomeMetadata,
  reduceFinalDisposition,
} from "@/lib/aim/run-outcome-telemetry"

describe("run-outcome-telemetry", () => {
  it("解析完整 RunOutcomeMetadata，缺字段返回 null", () => {
    expect(parseRunOutcomeMetadata({
      workflowId: "content-growth-v1",
      taskType: "generate",
      finalDisposition: "accepted_first_pass",
      humanActiveMinutes: 12,
      channel: "web",
      requestId: "req_1",
    })).toMatchObject({ finalDisposition: "accepted_first_pass", requestId: "req_1" })

    expect(parseRunOutcomeMetadata({
      workflowId: "content-growth-v1",
      finalDisposition: "accepted_first_pass",
      humanActiveMinutes: 12,
      channel: "web",
    })).toBeNull()
  })

  it("reducer：旧自由终态保持 unknown；结构化终态取最新值", () => {
    expect(reduceFinalDisposition([])).toBe("unknown")

    expect(reduceFinalDisposition([
      { event: "copied", createdAt: "2026-07-01T00:00:00Z" },
      { event: "accepted", createdAt: "2026-07-01T00:01:00Z" },
    ])).toBe("unknown")

    expect(reduceFinalDisposition([
      { event: "revised", createdAt: "2026-07-01T00:00:00Z" },
      {
        event: "final_disposition",
        createdAt: "2026-07-01T00:01:00Z",
        metadata: {
          workflowId: "w",
          taskType: "t",
          finalDisposition: "accepted_first_pass",
          humanActiveMinutes: 2,
          channel: "web",
          requestId: "req_accept",
        },
      },
    ])).toBe("accepted_after_edit")

    expect(reduceFinalDisposition([
      { event: "accepted", createdAt: "2026-07-01T00:00:00Z" },
      {
        event: "final_disposition",
        createdAt: "2026-07-01T00:02:00Z",
        metadata: {
          workflowId: "w",
          taskType: "t",
          finalDisposition: "rejected",
          humanActiveMinutes: 5,
          channel: "web",
          requestId: "req_reject",
        },
      },
    ])).toBe("rejected")
  })

  it("历史无终态不得当成接受或拒绝", () => {
    const code = reduceFinalDisposition([
      { event: "copied", createdAt: "2026-07-01T00:00:00Z" },
    ])
    expect(code).toBe("unknown")
    expect(isAcceptedDisposition(code)).toBe(false)
  })

  it("拒绝负人工时间、空 requestId，不静默修正输入", () => {
    expect(parseRunOutcomeMetadata({
      workflowId: "w",
      taskType: "t",
      finalDisposition: "rejected",
      humanActiveMinutes: -1,
      channel: "web",
      requestId: "req",
    })).toBeNull()
    expect(parseRunOutcomeMetadata({
      workflowId: "w",
      taskType: "t",
      finalDisposition: "rejected",
      humanActiveMinutes: 1,
      channel: "web",
      requestId: " ",
    })).toBeNull()
  })

  it("节省时间允许为负；比率与成本公式", () => {
    expect(computeTimeSavedMinutes(30, 10)).toBe(20)
    expect(computeTimeSavedMinutes(10, 30)).toBe(-20)
    expect(computeAcceptanceRate(8, 10)).toBeCloseTo(0.8)
    expect(computeFirstPassAcceptanceRate(5, 10)).toBeCloseTo(0.5)
    expect(computeRewriteRate(2, 10)).toBeCloseTo(0.2)
    expect(computeDirectCostPerSuccess(20, 4)).toBe(5)
    expect(computeFullyLoadedCost(10, 60, 120)).toBe(130)
  })
})

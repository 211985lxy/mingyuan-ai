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

  it("reducer：append-only 取最新终态；先改后接受 → accepted_after_edit", () => {
    expect(reduceFinalDisposition([])).toBe("unknown")

    expect(reduceFinalDisposition([
      { event: "copied", createdAt: "2026-07-01T00:00:00Z" },
      { event: "accepted", createdAt: "2026-07-01T00:01:00Z" },
    ])).toBe("accepted_first_pass")

    expect(reduceFinalDisposition([
      { event: "revised", createdAt: "2026-07-01T00:00:00Z" },
      { event: "accepted", createdAt: "2026-07-01T00:01:00Z" },
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

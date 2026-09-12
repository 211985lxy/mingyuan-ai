import { describe, expect, it } from "vitest"

import {
  biasCandidateRequestId,
  buildBaselinePrediction,
  detectSystematicBias,
  reconcilePrediction,
  type ReconciledOutcome,
} from "@/lib/aim/publish-prediction"

describe("buildBaselinePrediction", () => {
  it("区间来自基线四分位乘窗口系数，样本量决定置信度", () => {
    const result = buildBaselinePrediction(
      { sampleSize: 12, p25Views: 1000, medianViews: 2000, p75Views: 4000 },
      7,
      "hash-input",
    )
    expect(result.low).toBe(1000)
    expect(result.high).toBe(4000)
    expect(result.confidence).toBe("high")
    expect(result.rationaleDigest).toContain("12 条作品")
    expect(result.baselineHash).toHaveLength(64)
  })

  it("窗口越长区间越宽；样本不足置信度降级；基线为 0 时区间非负", () => {
    const week = buildBaselinePrediction({ sampleSize: 3, p25Views: 100, medianViews: 200, p75Views: 300 }, 7, "h")
    const month = buildBaselinePrediction({ sampleSize: 3, p25Views: 100, medianViews: 200, p75Views: 300 }, 30, "h")
    expect(month.high).toBeGreaterThan(week.high)
    expect(week.confidence).toBe("low")
    expect(week.low).toBeGreaterThanOrEqual(0)
  })
})

describe("reconcilePrediction", () => {
  it("区间内/超上界/破下界三态与偏离比", () => {
    expect(reconcilePrediction({ low: 100, high: 400 }, 250)).toEqual({ verdict: "within", deviationRatio: 1 })
    expect(reconcilePrediction({ low: 100, high: 400 }, 800).verdict).toBe("over")
    expect(reconcilePrediction({ low: 100, high: 400 }, 50).verdict).toBe("under")
    expect(reconcilePrediction({ low: 100, high: 400 }, 800).deviationRatio).toBeCloseTo(3.2)
  })

  it("中位为 0 时不计算比率", () => {
    expect(reconcilePrediction({ low: 0, high: 0 }, 0).deviationRatio).toBeNull()
  })
})

describe("detectSystematicBias", () => {
  it("样本不足或方向分裂时不产生候选", () => {
    const few: ReconciledOutcome[] = [
      { windowDay: 7, verdict: "over", deviationRatio: 3 },
      { windowDay: 7, verdict: "over", deviationRatio: 2 },
    ]
    expect(detectSystematicBias(few)).toEqual([])

    const split: ReconciledOutcome[] = [
      { windowDay: 7, verdict: "over", deviationRatio: 3 },
      { windowDay: 7, verdict: "over", deviationRatio: 2 },
      { windowDay: 7, verdict: "under", deviationRatio: 0.2 },
      { windowDay: 7, verdict: "under", deviationRatio: 0.3 },
    ]
    expect(detectSystematicBias(split)).toEqual([])
  })

  it("同窗口同向且中位偏离 ≥50% 时生成候选，摘要人可读", () => {
    const over: ReconciledOutcome[] = [
      { windowDay: 7, verdict: "over", deviationRatio: 3 },
      { windowDay: 7, verdict: "over", deviationRatio: 2.5 },
      { windowDay: 7, verdict: "within", deviationRatio: 1.6 },
    ]
    const drafts = detectSystematicBias(over)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.failureCode).toBe("prediction_bias_over")
    expect(drafts[0]?.payload.windowDay).toBe(7)
    expect(drafts[0]?.payload.medianDeviationRatio).toBe(2.5)
    expect(drafts[0]?.payload.summary).toContain("系统性高估")

    const under: ReconciledOutcome[] = over.map((item) => ({
      ...item,
      verdict: "under" as const,
      deviationRatio: item.deviationRatio != null ? 1 / item.deviationRatio : null,
    }))
    expect(detectSystematicBias(under)[0]?.failureCode).toBe("prediction_bias_under")
  })

  it("偏离不足 50% 不算系统性（正常波动）", () => {
    const mild: ReconciledOutcome[] = [
      { windowDay: 14, verdict: "over", deviationRatio: 1.3 },
      { windowDay: 14, verdict: "over", deviationRatio: 1.25 },
      { windowDay: 14, verdict: "over", deviationRatio: 1.2 },
    ]
    expect(detectSystematicBias(mild)).toEqual([])
  })
})

describe("biasCandidateRequestId", () => {
  it("同项目同窗口同方向同周幂等；换周/换窗口/换项目产生新键", () => {
    const draft = {
      targetType: "methodology_revision" as const,
      failureCode: "prediction_bias_over" as const,
      payload: { windowDay: 7, sample: 3, overCount: 3, underCount: 0, medianDeviationRatio: 2, summary: "s" },
    }
    const sunday = new Date("2026-09-06T10:00:00.000Z")
    const monday = new Date("2026-09-07T10:00:00.000Z")
    expect(biasCandidateRequestId("p1", draft, sunday)).toBe(biasCandidateRequestId("p1", draft, new Date("2026-09-06T23:00:00.000Z")))
    expect(biasCandidateRequestId("p1", draft, sunday)).not.toBe(biasCandidateRequestId("p1", draft, monday))
    expect(biasCandidateRequestId("p1", draft, sunday)).not.toBe(
      biasCandidateRequestId("p1", { ...draft, payload: { ...draft.payload, windowDay: 30 } }, sunday),
    )
    expect(biasCandidateRequestId(null, draft, sunday)).toContain("none")
  })
})

import { describe, expect, it } from "vitest"
import {
  buildPredictedMetrics,
  isLargeDeviation,
  overallVerdict,
  rangeFromBaseline,
  verdictForMetric,
} from "@/lib/aim/publish-prediction"
import { renderPredictionRetroBlock } from "@/lib/aim/publish-prediction"

describe("发布预测对账", () => {
  it("基线拉出区间，落在区间内算命中", () => {
    const range = rangeFromBaseline(100, 0.45)
    expect(range.min).toBeLessThan(100)
    expect(range.max).toBeGreaterThan(100)
    expect(verdictForMetric(100, range)).toBe("hit")
    expect(verdictForMetric(range.max + 10, range)).toBe("over")
    expect(verdictForMetric(Math.max(0, range.min - 10), range)).toBe("under")
  })

  it("偏差超两倍才进学习候选阈值", () => {
    const predicted = buildPredictedMetrics({ views: 100, likes: 10, comments: 2, saves: 3, shares: 1 })
    expect(isLargeDeviation({ views: 110, likes: 11, comments: 2, saves: 3, shares: 1 }, predicted)).toBe(false)
    expect(isLargeDeviation({ views: 1000, likes: 11, comments: 2, saves: 3, shares: 1 }, predicted)).toBe(true)
    expect(overallVerdict({ views: 1000, likes: 80, comments: 20, saves: 30, shares: 10 }, predicted)).toBe("over")
  })

  it("复盘块从预测-验证写，不编造实际数字", () => {
    const block = renderPredictionRetroBlock([
      { windowDays: 7, viewsMin: 100, viewsMax: 200, actualViews: null, verdict: null },
    ])
    expect(block).toContain("预测 vs 实际")
    expect(block).toContain("尚未回流")
  })
})

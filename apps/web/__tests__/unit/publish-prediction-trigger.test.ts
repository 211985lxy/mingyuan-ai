import { describe, expect, it } from "vitest"

import { buildBaselineFromSortedViews } from "@/lib/aim/publish-prediction-trigger"

describe("buildBaselineFromSortedViews", () => {
  it("样本不足 3 条返回 null（宁可不表态）", () => {
    expect(buildBaselineFromSortedViews([100, 200])).toBeNull()
  })

  it("奇数样本取四分位与中位", () => {
    const baseline = buildBaselineFromSortedViews([100, 200, 300, 400, 500])
    expect(baseline).toEqual({ sampleSize: 5, p25Views: 200, medianViews: 300, p75Views: 400 })
  })

  it("偶数样本中位取平均，四分位按索引取", () => {
    const baseline = buildBaselineFromSortedViews([100, 200, 300, 400])
    expect(baseline?.medianViews).toBe(250)
    expect(baseline?.p25Views).toBe(200)
    expect(baseline?.p75Views).toBe(400)
  })

  it("假定输入已升序（调用方负责排序）", () => {
    const baseline = buildBaselineFromSortedViews([500, 100, 300, 200, 400].sort((a, b) => a - b))
    expect(baseline?.medianViews).toBe(300)
  })
})

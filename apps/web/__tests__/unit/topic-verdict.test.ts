import { describe, it, expect } from "vitest"
import { normalizeScoreBreakdown } from "@/lib/topic-generation"

describe("选题评分消除伪精确", () => {
  it("缺分时各维度为 null 而非默认 80/75", () => {
    const r = normalizeScoreBreakdown(undefined)
    expect(r.projectFit).toBeNull()
    expect(r.viralHook).toBeNull()
  })
  it("有分时正常 clamp", () => {
    const r = normalizeScoreBreakdown({ projectFit: 88, contentValue: 92, viralHook: 70, conversionFit: 60, feasibility: 80 })
    expect(r.projectFit).toBe(88)
  })
})

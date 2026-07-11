import { describe, it, expect } from "vitest"
import { sanitizeOutcomeBody } from "@/lib/content-outcome"

describe("sanitizeOutcomeBody", () => {
  it("未填写字段为 null，不转为 0", () => {
    const out = sanitizeOutcomeBody({ collectWindowDay: 7, dmCount: 3 })
    expect(out.dmCount).toBe(3)
    expect(out.qualifiedLeadCount).toBeNull()
    expect(out.views).toBeNull()
  })
  it("空字符串/undefined -> null（绝不当 0）", () => {
    const out = sanitizeOutcomeBody({ collectWindowDay: 7, views: "", revenue: undefined })
    expect(out.views).toBeNull()
    expect(out.revenue).toBeNull()
  })
  it("非法 collectWindowDay 拒绝", () => {
    expect(() => sanitizeOutcomeBody({ collectWindowDay: 5 })).toThrow()
    expect(() => sanitizeOutcomeBody({ collectWindowDay: "7" as any })).toThrow()
  })
  it("显式 0 保留为 0（用户确实填了 0）", () => {
    expect(sanitizeOutcomeBody({ collectWindowDay: 7, dmCount: 0 }).dmCount).toBe(0)
  })
})

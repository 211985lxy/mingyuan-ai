import { describe, expect, it } from "vitest"
import { computeCostCny } from "@/lib/aim-harness/model-pricing"

describe("model pricing", () => {
  it("uses observed input/output usage and cache tokens", () => {
    expect(computeCostCny("doubao", "doubao-seed-2-1-pro-260628", { inputTokens: 1000, outputTokens: 1000 })).toBe(0.036)
    expect(computeCostCny("deepseek", "deepseek-chat", { inputTokens: 1000, outputTokens: 1000, cachedTokens: 500 })).toBe(0.00755)
  })

  it("does not invent a cost when usage is unavailable", () => {
    expect(computeCostCny("deepseek", "deepseek-chat", {})).toBeUndefined()
  })
})

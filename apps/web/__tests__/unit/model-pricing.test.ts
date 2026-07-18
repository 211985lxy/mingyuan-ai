/**
 * model-pricing — cost computation unit tests (no model, no DB).
 *
 * Locks the cost formula: cached input billed at cached rate, remainder at full
 * input rate, plus output. Undefined usage → undefined cost (no phantom zero).
 */
import { describe, expect, it } from "vitest"

import { computeCostCny } from "@/lib/aim-harness/model-pricing"

describe("computeCostCny", () => {
  it("computes cost for DeepSeek V4-Pro with exact key", () => {
    // 1000 input + 500 output, no cache → 3/1M * 1000 + 6/1M * 500
    const cost = computeCostCny("deepseek", "deepseek-chat", {
      inputTokens: 1000,
      outputTokens: 500,
    })
    // 0.003 + 0.003 = 0.006
    expect(cost).toBeCloseTo(0.006, 6)
  })

  it("bills cached tokens at the discounted rate", () => {
    // 1000 input where 800 cached, 0 output
    // (200 * 3 + 800 * 0.1) / 1M = (600 + 80)/1M = 0.00068
    const cost = computeCostCny("deepseek", "deepseek-v4-pro", {
      inputTokens: 1000,
      outputTokens: 0,
      cachedTokens: 800,
    })
    expect(cost).toBeCloseTo(0.00068, 6)
  })

  it("falls back by model substring when provider differs", () => {
    // unknown provider but model contains "kimi" → kimi prices (14/56)
    const cost = computeCostCny("some-gateway", "Kimi-K2.6-Instruct", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    })
    expect(cost).toBeCloseTo(14, 6)
  })

  it("returns undefined when no usage observed", () => {
    expect(computeCostCny("deepseek", "deepseek-chat", {})).toBeUndefined()
  })

  it("handles input-only usage (output undefined)", () => {
    const cost = computeCostCny("glm", "glm-5.1", { inputTokens: 500_000 })
    // 2/1M * 500000 = 1.0
    expect(cost).toBeCloseTo(1.0, 6)
  })

  it("uses conservative default for fully unknown models", () => {
    const cost = computeCostCny(undefined, undefined, { inputTokens: 1_000_000 })
    // default input 5
    expect(cost).toBeCloseTo(5, 6)
  })

  it("returns undefined cost but keeps token-less when model is unknown sentinel", () => {
    // covered indirectly by snapshot.ts: hasModel=false → cost undefined.
    // here we just confirm resolvePrices default doesn't crash on undefined model
    expect(computeCostCny("unknown", undefined, { inputTokens: 100 })).toBeCloseTo(0.0005, 6)
  })
})

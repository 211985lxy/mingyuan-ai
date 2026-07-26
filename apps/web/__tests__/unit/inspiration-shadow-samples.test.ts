import { describe, expect, it } from "vitest"
import { CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES } from "@/lib/aim-harness/content-rollout-gate"
import {
  buildRolloutEvidenceFromShadowCount,
  countShadowSamples,
  formatShadowSampleProgress,
  judgeInspirationShadowSample,
} from "@/lib/inspiration-shadow-samples"

describe("judgeInspirationShadowSample", () => {
  it("counts capture_only feishu ingress as shadow sample", () => {
    const judged = judgeInspirationShadowSample({
      id: "1",
      source: "feishu",
      externalMessageId: "om_1",
      executionModeSnapshot: "capture_only",
    })
    expect(judged.isShadowSample).toBe(true)
    expect(judged.mode).toBe("capture_only")
  })

  it("counts evaluate with video url as shadow sample", () => {
    const judged = judgeInspirationShadowSample({
      id: "2",
      source: "webhook",
      sourceUrl: "https://v.douyin.com/abc",
      executionModeSnapshot: "evaluate",
    })
    expect(judged.isShadowSample).toBe(true)
    expect(judged.mode).toBe("evaluate")
  })

  it("rejects live rows", () => {
    const judged = judgeInspirationShadowSample({
      id: "3",
      source: "feishu",
      externalMessageId: "om_2",
      executionModeSnapshot: "live",
    })
    expect(judged.isShadowSample).toBe(false)
  })

  it("rejects text-only rows without channel ingress", () => {
    const judged = judgeInspirationShadowSample({
      id: "4",
      source: "text",
      executionModeSnapshot: "capture_only",
    })
    expect(judged.isShadowSample).toBe(false)
  })

  it("treats missing snapshot as capture_only for legacy rows", () => {
    const judged = judgeInspirationShadowSample({
      id: "5",
      source: "feishu",
      dedupeKey: "feishu:chat:msg",
      executionModeSnapshot: null,
    })
    expect(judged.isShadowSample).toBe(true)
    expect(judged.mode).toBe("capture_only")
  })
})

describe("countShadowSamples", () => {
  it("aggregates by mode and remaining-to-gate", () => {
    const result = countShadowSamples([
      { id: "a", source: "feishu", externalMessageId: "1", executionModeSnapshot: "capture_only" },
      { id: "b", source: "feishu", externalMessageId: "2", executionModeSnapshot: "evaluate" },
      { id: "c", source: "feishu", externalMessageId: "3", executionModeSnapshot: "live" },
      { id: "d", source: "text", executionModeSnapshot: "capture_only" },
    ])
    expect(result.total).toBe(2)
    expect(result.byMode.capture_only).toBe(1)
    expect(result.byMode.evaluate).toBe(1)
    expect(result.remainingToGate).toBe(CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES - 2)
  })
})

describe("buildRolloutEvidenceFromShadowCount", () => {
  it("blocks promotion until 30 shadow samples", () => {
    const { gate } = buildRolloutEvidenceFromShadowCount({
      shadowSampleCount: 12,
      consecutiveWorkdaysWithoutP0P1: 5,
      severeFabricationCount: 0,
      idempotentSuppressionObserved: true,
      failureRetryableObserved: true,
      currentLevel: "capture_only",
      targetLevel: "evaluate",
    })
    expect(gate.ok).toBe(false)
    expect(gate.reasons.some((r) => r.includes("影子样本"))).toBe(true)
  })

  it("formats progress text", () => {
    expect(formatShadowSampleProgress(0)).toContain("0/30")
    expect(formatShadowSampleProgress(30)).toContain("已达门禁")
  })
})

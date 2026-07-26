import { describe, expect, it } from "vitest"
import { CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES } from "@/lib/aim-harness/content-rollout-gate"
import {
  buildRolloutEvidenceFromShadowCount,
  countShadowSamples,
  formatShadowSampleProgress,
  judgeInspirationShadowSample,
} from "@/lib/inspiration-shadow-samples"

const validShadow = {
  source: "feishu" as const,
  externalMessageId: "om_1",
  replyStatus: "suppressed" as const,
}

describe("judgeInspirationShadowSample", () => {
  it("counts capture_only feishu ingress as shadow sample", () => {
    const judged = judgeInspirationShadowSample({
      id: "1",
      ...validShadow,
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
      replyStatus: "suppressed",
      executionModeSnapshot: "evaluate",
    })
    expect(judged.isShadowSample).toBe(true)
    expect(judged.mode).toBe("evaluate")
  })

  it("rejects live rows", () => {
    const judged = judgeInspirationShadowSample({
      id: "3",
      ...validShadow,
      externalMessageId: "om_2",
      executionModeSnapshot: "live",
    })
    expect(judged.isShadowSample).toBe(false)
  })

  it("rejects text-only rows without channel ingress", () => {
    const judged = judgeInspirationShadowSample({
      id: "4",
      source: "text",
      replyStatus: "suppressed",
      executionModeSnapshot: "capture_only",
    })
    expect(judged.isShadowSample).toBe(false)
  })

  it("rejects missing snapshot — legacy rows do not count toward gate", () => {
    const judged = judgeInspirationShadowSample({
      id: "5",
      source: "feishu",
      dedupeKey: "feishu:chat:msg",
      replyStatus: "suppressed",
      executionModeSnapshot: null,
    })
    expect(judged.isShadowSample).toBe(false)
    expect(judged.invalidMode).toBe(true)
    expect(judged.mode).toBeNull()
  })

  it("rejects illegal snapshot", () => {
    const judged = judgeInspirationShadowSample({
      id: "6",
      ...validShadow,
      executionModeSnapshot: "shadow",
    })
    expect(judged.isShadowSample).toBe(false)
    expect(judged.invalidMode).toBe(true)
  })

  it("rejects shadow rows with topicSelectionId as formal-write violation", () => {
    const judged = judgeInspirationShadowSample({
      id: "7",
      ...validShadow,
      executionModeSnapshot: "capture_only",
      topicSelectionId: "sel_1",
    })
    expect(judged.isShadowSample).toBe(false)
    expect(judged.formalWriteViolation).toBe(true)
  })

  it("rejects shadow rows without suppressed reply as reply violation", () => {
    const judged = judgeInspirationShadowSample({
      id: "8",
      source: "feishu",
      externalMessageId: "om_8",
      executionModeSnapshot: "evaluate",
      replyStatus: "pending",
    })
    expect(judged.isShadowSample).toBe(false)
    expect(judged.replyViolation).toBe(true)
  })
})

describe("countShadowSamples", () => {
  it("aggregates by mode, remaining-to-gate, and violations", () => {
    const result = countShadowSamples([
      { id: "a", source: "feishu", externalMessageId: "1", executionModeSnapshot: "capture_only", replyStatus: "suppressed" },
      { id: "b", source: "feishu", externalMessageId: "2", executionModeSnapshot: "evaluate", replyStatus: "suppressed" },
      { id: "c", source: "feishu", externalMessageId: "3", executionModeSnapshot: "live", replyStatus: "sent" },
      { id: "d", source: "text", executionModeSnapshot: "capture_only", replyStatus: "suppressed" },
      { id: "e", source: "feishu", externalMessageId: "5", executionModeSnapshot: null, replyStatus: "suppressed" },
      { id: "f", source: "feishu", externalMessageId: "6", executionModeSnapshot: "capture_only", replyStatus: "suppressed", topicSelectionId: "sel" },
      { id: "g", source: "feishu", externalMessageId: "7", executionModeSnapshot: "evaluate", replyStatus: "pending" },
    ])
    expect(result.total).toBe(2)
    expect(result.byMode.capture_only).toBe(1)
    expect(result.byMode.evaluate).toBe(1)
    expect(result.remainingToGate).toBe(CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES - 2)
    expect(result.invalidCount).toBe(1)
    expect(result.formalWriteViolationCount).toBe(1)
    expect(result.replyViolationCount).toBe(1)
  })
})

describe("buildRolloutEvidenceFromShadowCount", () => {
  it("blocks promotion at 29 shadow samples", () => {
    const { gate } = buildRolloutEvidenceFromShadowCount({
      shadowSampleCount: 29,
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

  it("passes promotion at 30 when other evidence is met", () => {
    const { gate } = buildRolloutEvidenceFromShadowCount({
      shadowSampleCount: 30,
      consecutiveWorkdaysWithoutP0P1: 5,
      severeFabricationCount: 0,
      idempotentSuppressionObserved: true,
      failureRetryableObserved: true,
      currentLevel: "capture_only",
      targetLevel: "evaluate",
    })
    expect(gate.ok).toBe(true)
  })

  it("formats progress text", () => {
    expect(formatShadowSampleProgress(0)).toContain("0/30")
    expect(formatShadowSampleProgress(30)).toContain("已达门禁")
  })
})

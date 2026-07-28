import { describe, expect, it } from "vitest"
import {
  assertCandidateCannotWriteFormalKnowledge,
  buildLearningRequestId,
  shouldAutoCreateFromCostOrLatency,
  shouldAutoCreateFromDisposition,
  shouldAutoCreateFromFailureCode,
  shouldCreateFromVerdictCode,
  shouldSampleSuccessfulRun,
  transitionLearningReview,
  validateLearningCandidateDraft,
} from "@/lib/aim/learning-candidate"

describe("learning-candidate", () => {
  it("校验草稿与幂等键", () => {
    const draft = validateLearningCandidateDraft({
      sourceType: "run_event",
      sourceId: "evt_1",
      targetType: "eval_fixture",
      payload: { reason: "rejected" },
      requestId: "req_1",
    })
    expect(draft.sourceId).toBe("evt_1")
    expect(buildLearningRequestId("run_event", "evt_1", "eval_fixture")).toBe(
      "lc:run_event:evt_1:eval_fixture",
    )
    expect(() =>
      validateLearningCandidateDraft({
        sourceType: "run_event",
        sourceId: "evt_1",
        targetType: "eval_fixture",
        payload: [],
        requestId: "req_1",
      } as never),
    ).toThrow(/payload/)
  })

  it("拒绝/重写/严重失败/高成本自动入候选；neutral 不入", () => {
    expect(shouldAutoCreateFromDisposition("rejected")).toBe(true)
    expect(shouldAutoCreateFromDisposition("rewrite_requested")).toBe(true)
    expect(shouldAutoCreateFromDisposition("accepted_first_pass")).toBe(false)
    expect(shouldAutoCreateFromFailureCode("severe_hallucination")).toBe(true)
    expect(shouldAutoCreateFromFailureCode("typo")).toBe(false)
    expect(shouldAutoCreateFromCostOrLatency({ costCny: 6 })).toBe(true)
    expect(shouldAutoCreateFromCostOrLatency({ durationMs: 200_000 })).toBe(true)
    expect(shouldAutoCreateFromCostOrLatency({ costCny: 1, durationMs: 1000 })).toBe(false)
    expect(shouldCreateFromVerdictCode("failed")).toBe(true)
    expect(shouldCreateFromVerdictCode("neutral")).toBe(false)
    expect(shouldCreateFromVerdictCode("unknown")).toBe(false)
  })

  it("成功任务 10% 稳定抽样", () => {
    const hits = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t"]
      .filter((id) => shouldSampleSuccessfulRun(id, 0.1)).length
    // 稳定哈希：同一批 ID 命中数应确定且远小于全量
    expect(hits).toBeLessThan(10)
    expect(shouldSampleSuccessfulRun("stable_id_1", 0.1)).toBe(
      shouldSampleSuccessfulRun("stable_id_1", 0.1),
    )
  })

  it("状态机：未批准不得写正式知识；晋升需 promotedRef", () => {
    expect(
      transitionLearningReview({
        current: "pending",
        decision: "approve",
        reviewerId: "u1",
      }),
    ).toMatchObject({ ok: true, next: "approved" })

    expect(
      transitionLearningReview({
        current: "approved",
        decision: "promote",
        reviewerId: "u1",
      }).ok,
    ).toBe(false)

    expect(
      transitionLearningReview({
        current: "approved",
        decision: "promote",
        reviewerId: "u1",
        promotedRef: "fixture_v2",
      }),
    ).toMatchObject({ ok: true, next: "promoted", promotedRef: "fixture_v2" })

    expect(() =>
      assertCandidateCannotWriteFormalKnowledge({ reviewStatus: "pending" }),
    ).toThrow(/不得写入正式/)

    expect(() =>
      assertCandidateCannotWriteFormalKnowledge({ reviewStatus: "approved" }),
    ).toThrow(/未晋升/)

    expect(() =>
      assertCandidateCannotWriteFormalKnowledge({
        reviewStatus: "promoted",
        promotedRef: "fixture_v2",
      }),
    ).not.toThrow()
  })
})

import { describe, expect, it } from "vitest"
import {
  canAttachToPerformanceReview,
  canSignReviewCycle,
  computeActionCloseRate,
  computeRate,
  validateReviewActionDraft,
  validateReviewCycleDraft,
} from "@/lib/aim/review-cycle"

const START = new Date("2026-07-06T00:00:00.000Z")
const END = new Date("2026-07-13T00:00:00.000Z")

const SNAPSHOT = {
  publishedCount: 3,
  qualifiedLeadCount: 5,
  appointmentCount: 2,
  dealCount: 1,
  revenue: 9800,
  paymentCount: 1,
  paymentAmountCny: 9800,
  customerOutcomeCount: 0,
  timeSavedMinutes: 40,
  firstPassAcceptanceRate: 0.5,
  rewriteRate: 0.2,
  rejectionRate: 0.1,
  directCostPerSuccess: 3.5,
  fullyLoadedCost: 120,
  p0FailureCount: 0,
  p1FailureCount: 1,
  humanTakeoverCount: 1,
  highCostAnomalyCount: 0,
  pendingKnowledgeCandidates: 2,
  pendingCaseCandidates: 1,
  pendingMemoryCandidates: 0,
  pendingEvalCandidates: 1,
  pendingMethodologyCandidates: 1,
  previousActionCloseRate: 0.75,
  day7BackfillRate: 0.8,
}

describe("review-cycle", () => {
  it("校验周期与行动项草稿", () => {
    expect(() =>
      validateReviewCycleDraft({
        requestId: "review_1",
        periodStart: END,
        periodEnd: START,
        systemOwnerId: "sys_1",
        metricsSnapshot: SNAPSHOT,
      }),
    ).toThrow(/periodEnd/)

    const draft = validateReviewCycleDraft({
      requestId: "review_1",
      periodStart: START,
      periodEnd: END,
      systemOwnerId: "  sys_1  ",
      metricsSnapshot: SNAPSHOT,
    })
    expect(draft.systemOwnerId).toBe("sys_1")

    expect(() =>
      validateReviewActionDraft({ title: "  ", ownerId: "u1", dueAt: END }),
    ).toThrow(/title/)
  })

  it("签字要求 draft + 至少一条行动项", () => {
    expect(canSignReviewCycle({ status: "draft", systemOwnerId: "sys", actionCount: 0 }).ok).toBe(false)
    expect(canSignReviewCycle({ status: "signed", systemOwnerId: "sys", actionCount: 2 }).ok).toBe(false)
    expect(canSignReviewCycle({ status: "draft", systemOwnerId: "sys", actionCount: 1 }).ok).toBe(true)
  })

  it("行动关闭率与岗位评价门闩", () => {
    expect(computeActionCloseRate([])).toBeNull()
    expect(computeActionCloseRate([{ status: "done" }, { status: "open" }, { status: "cancelled" }])).toBe(0.5)
    expect(computeRate(4, 5)).toBeCloseTo(0.8)
    expect(computeRate(1, 0)).toBeNull()

    expect(
      canAttachToPerformanceReview([
        { status: "signed", signedAt: END, periodStart: START, periodEnd: END },
        { status: "signed", signedAt: END, periodStart: START, periodEnd: END },
        { status: "signed", signedAt: END, periodStart: START, periodEnd: END },
        { status: "draft", periodStart: START, periodEnd: END },
      ]),
    ).toBe(false)

    expect(
      canAttachToPerformanceReview([
        {
          status: "signed",
          signedAt: END,
          periodStart: new Date("2026-06-15T00:00:00Z"),
          periodEnd: new Date("2026-06-22T00:00:00Z"),
        },
        {
          status: "signed",
          signedAt: END,
          periodStart: new Date("2026-06-22T00:00:00Z"),
          periodEnd: new Date("2026-06-29T00:00:00Z"),
        },
        {
          status: "signed",
          signedAt: END,
          periodStart: new Date("2026-06-29T00:00:00Z"),
          periodEnd: new Date("2026-07-06T00:00:00Z"),
        },
        { status: "signed", signedAt: END, periodStart: START, periodEnd: END },
      ]),
    ).toBe(true)
  })
})

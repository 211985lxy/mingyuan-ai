import { describe, expect, it } from "vitest"
import {
  buildSuccessCaseCandidateFromCustomerOutcome,
  canMarkDeliverySuccess,
  canPromoteSuccessCase,
  type CustomerOutcomeProjectionLike,
} from "@/lib/aim/customer-outcome"
import { buildAssetCandidatesFromOutcome } from "@/lib/aim/outcome-asset-candidates"

function row(overrides: Partial<CustomerOutcomeProjectionLike> = {}): CustomerOutcomeProjectionLike {
  return {
    id: "co_1",
    projectId: "proj_1",
    externalOutcomeId: "ext_outcome_1",
    externalDealId: "deal_1",
    metricCode: "revenue_30d",
    baseline: 10,
    target: 20,
    actual: 28,
    unit: "万",
    observedFrom: new Date("2026-06-01T00:00:00.000Z"),
    observedTo: new Date("2026-07-01T00:00:00.000Z"),
    evidenceRef: "feishu:doc/abc",
    reviewStatus: "approved",
    reviewerRef: "user:owner_1",
    reviewedAt: new Date("2026-07-02T00:00:00.000Z"),
    ...overrides,
  }
}

describe("canMarkDeliverySuccess", () => {
  it("齐全证据可标记交付成功", () => {
    expect(canMarkDeliverySuccess(row())).toBe(true)
  })

  it("缺 baseline / actual / 证据 / 审核人任一则不可标记", () => {
    expect(canMarkDeliverySuccess(row({ baseline: null }))).toBe(false)
    expect(canMarkDeliverySuccess(row({ actual: null }))).toBe(false)
    expect(canMarkDeliverySuccess(row({ evidenceRef: "  " }))).toBe(false)
    expect(canMarkDeliverySuccess(row({ reviewerRef: null }))).toBe(false)
  })

  it("仅 pending 审核仍可具备交付成功证据字段，但不可晋升成功案例", () => {
    const pending = row({ reviewStatus: "pending" })
    expect(canMarkDeliverySuccess(pending)).toBe(true)
    expect(canPromoteSuccessCase(pending)).toBe(false)
  })
})

describe("buildSuccessCaseCandidateFromCustomerOutcome", () => {
  it("已审核且证据齐全 → 成功案例候选", () => {
    const draft = buildSuccessCaseCandidateFromCustomerOutcome(row(), {
      customerLabel: "明动客户A",
    })
    expect(draft).not.toBeNull()
    expect(draft?.kind).toBe("case_candidate")
    expect(draft?.title).toContain("成功案例候选")
    expect(draft?.title).not.toContain("转化案例候选")
    expect(draft?.confidence).toBe("high")
    expect(draft?.crossProjectAllowed).toBe(false)
    expect(draft?.evidence).toContain("externalOutcomeId=ext_outcome_1")
  })

  it("无客户结果证据时不能晋升成功案例", () => {
    expect(buildSuccessCaseCandidateFromCustomerOutcome(row({ actual: null }))).toBeNull()
    expect(buildSuccessCaseCandidateFromCustomerOutcome(row({ reviewStatus: "rejected" }))).toBeNull()
    expect(buildSuccessCaseCandidateFromCustomerOutcome(row({ reviewerRef: "" }))).toBeNull()
  })
})

describe("WP-0 / WP-4 边界：成交仍只出转化案例", () => {
  it("ContentOutcome 成交不生成成功案例标题", () => {
    const drafts = buildAssetCandidatesFromOutcome({
      outcomeId: "o1",
      generationId: "g1",
      projectId: "p1",
      platform: "抖音",
      copy: "成稿",
      qualifiedLeadCount: null,
      appointmentCount: null,
      dealCount: 1,
      revenue: 9800,
      userVerdict: null,
      verdictCode: "neutral",
      reason: "有成交",
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.title).toContain("转化案例候选")
    expect(drafts[0]?.title).not.toContain("成功案例")
  })
})

import { describe, expect, it } from "vitest"

import {
  TOPIC_REVIEW_STATUS,
  parseTopicReviewAction,
  planTopicReviewDecision,
} from "@/lib/topic-review"

const REVIEWER = "ou_reviewer_1"

describe("topic review action parsing", () => {
  it("接受三种动作，其余一律拒绝", () => {
    expect(parseTopicReviewAction("adopt")).toBe("adopt")
    expect(parseTopicReviewAction("regenerate")).toBe("regenerate")
    expect(parseTopicReviewAction("reject")).toBe("reject")

    expect(parseTopicReviewAction("approve")).toBeNull()
    expect(parseTopicReviewAction("")).toBeNull()
    expect(parseTopicReviewAction(undefined)).toBeNull()
    expect(parseTopicReviewAction(7)).toBeNull()
  })
})

describe("topic review decision", () => {
  it("采用与控制台路径产出一致状态，并记录人工裁决", () => {
    const now = new Date("2026-09-11T01:10:00.000Z")
    const plan = planTopicReviewDecision({
      action: "adopt",
      candidateCount: 4,
      rawIndex: 2,
      reviewedBy: REVIEWER,
      reviewedVia: "feishu",
      now,
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.atomicOnPendingStatus).toBe(true)
    expect(plan.patch).toEqual({
      status: "selected",
      selectedIndex: 2,
      reviewStatus: TOPIC_REVIEW_STATUS.adopted,
      reviewedAt: now,
      reviewedBy: REVIEWER,
      reviewedVia: "feishu",
    })
  })

  it("拒绝采用降级模板批次", () => {
    const plan = planTopicReviewDecision({
      action: "adopt",
      candidateCount: 4,
      rawIndex: 0,
      reviewedBy: REVIEWER,
      reviewedVia: "feishu",
      degraded: true,
    })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.error).toContain("重新生成")
  })

  it("采用序号越界或缺失时拒绝，不产生 selectedIndex", () => {
    for (const rawIndex of [-1, 4, 99, "x", undefined, null, 1.5]) {
      const plan = planTopicReviewDecision({
        action: "adopt",
        candidateCount: 4,
        rawIndex,
        reviewedBy: REVIEWER,
        reviewedVia: "feishu",
      })
      expect(plan.ok).toBe(false)
      if (!plan.ok) expect(plan.error).toContain("候选序号无效")
    }
  })

  it("序号允许 0 基下标与数字字符串（卡片 value 可能被序列化）", () => {
    const zero = planTopicReviewDecision({
      action: "adopt", candidateCount: 4, rawIndex: 0, reviewedBy: REVIEWER, reviewedVia: "feishu",
    })
    const stringy = planTopicReviewDecision({
      action: "adopt", candidateCount: 4, rawIndex: "3", reviewedBy: REVIEWER, reviewedVia: "feishu",
    })
    expect(zero.ok && zero.patch.selectedIndex).toBe(0)
    expect(stringy.ok && stringy.patch.selectedIndex).toBe(3)
  })

  it("换一批与都不行都不改 status，也不需要 pending 原子保护", () => {
    const regenerate = planTopicReviewDecision({
      action: "regenerate", candidateCount: 4, reviewedBy: REVIEWER, reviewedVia: "feishu",
    })
    const reject = planTopicReviewDecision({
      action: "reject", candidateCount: 4, reviewedBy: REVIEWER, reviewedVia: "feishu",
    })

    expect(regenerate.ok).toBe(true)
    if (!regenerate.ok) return
    expect(regenerate.atomicOnPendingStatus).toBe(false)
    expect(regenerate.patch.status).toBeUndefined()
    expect(regenerate.patch.selectedIndex).toBeUndefined()
    expect(regenerate.patch.reviewStatus).toBe(TOPIC_REVIEW_STATUS.regenerated)

    expect(reject.ok).toBe(true)
    if (!reject.ok) return
    expect(reject.patch.reviewStatus).toBe(TOPIC_REVIEW_STATUS.archived)
  })

  it("备注去空白后才写入，空白备注不落库", () => {
    const withNote = planTopicReviewDecision({
      action: "reject", candidateCount: 2, reviewedBy: REVIEWER, reviewedVia: "feishu", note: "  都不贴客户  ",
    })
    const blankNote = planTopicReviewDecision({
      action: "reject", candidateCount: 2, reviewedBy: REVIEWER, reviewedVia: "feishu", note: "   ",
    })

    expect(withNote.ok && withNote.patch.reviewNote).toBe("都不贴客户")
    expect(blankNote.ok && blankNote.patch.reviewNote).toBeUndefined()
  })
})

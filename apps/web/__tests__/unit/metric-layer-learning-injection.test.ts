import { describe, expect, it } from "vitest"
import {
  formatLearningsBlock,
  hashLearnings,
  mapCandidateToConstraint,
  mergeLearningsIntoKnowledge,
  selectInjectedLearnings,
  stripLearningsPrefix,
} from "@/lib/aim/learning-injection"
import { computeOperatingLedger, type WeeklyReviewStorePort } from "@/lib/aim/metric-layer"

describe("学习注入映射", () => {
  it("只注入已批准的方法论/技能候选，eval_fixture 不进生成", () => {
    const selected = selectInjectedLearnings([
      {
        id: "a",
        targetType: "methodology_revision",
        reviewStatus: "approved",
        payload: { constraint: "禁止使用赋能、闭环" },
      },
      {
        id: "b",
        targetType: "eval_fixture",
        reviewStatus: "approved",
        payload: { constraint: "这是评测夹具，不该进稿" },
      },
      {
        id: "c",
        targetType: "skill_draft",
        reviewStatus: "pending",
        payload: { constraint: "未批准" },
      },
    ])
    expect(selected).toEqual([
      { id: "a", targetType: "methodology_revision", constraint: "禁止使用赋能、闭环" },
    ])
  })

  it("失败码可回落成约束，空 payload 不编造", () => {
    expect(mapCandidateToConstraint({
      id: "x",
      targetType: "methodology_revision",
      reviewStatus: "approved",
      failureCode: "severe_hallucination",
      payload: {},
    })?.constraint).toContain("severe_hallucination")
    expect(mapCandidateToConstraint({
      id: "y",
      targetType: "methodology_revision",
      reviewStatus: "approved",
      payload: {},
    })).toBeNull()
  })

  it("learningsHash 只跟候选 id 有关，顺序无关", () => {
    const a = hashLearnings([
      { id: "2", targetType: "skill_draft", constraint: "b" },
      { id: "1", targetType: "methodology_revision", constraint: "a" },
    ])
    const b = hashLearnings([
      { id: "1", targetType: "methodology_revision", constraint: "a" },
      { id: "2", targetType: "skill_draft", constraint: "b" },
    ])
    expect(a).toBe(b)
    expect(formatLearningsBlock([])).toBe("")
    expect(mergeLearningsIntoKnowledge("知识", "教训")).toContain("教训")
    expect(stripLearningsPrefix("【历史教训】禁止赋能\n\n正文知识")).toBe("正文知识")
    expect(stripLearningsPrefix("普通知识")).toBe("普通知识")
  })
})

describe("经营账本指标层", () => {
  it("可追溯线索读归因表，不把 unknown 混进去", async () => {
    const store: WeeklyReviewStorePort = {
      aimGeneration: {
        findMany: async () => [
          {
            id: "g1",
            workflowStatus: "published",
            publishedAt: new Date("2026-07-07T10:00:00Z"),
            createdAt: new Date("2026-07-07T09:00:00Z"),
            knowledgeUsed: [],
          },
        ],
      },
      contentOutcome: { findMany: async () => [] },
      outcomeAttribution: {
        findMany: async () => [
          { generationId: "g1", attributionMethod: "explicit", occurredAt: new Date("2026-07-08T00:00:00Z"), externalDealId: "d1" },
          { generationId: "g1", attributionMethod: "unknown", occurredAt: new Date("2026-07-08T00:00:00Z") },
        ],
      },
    }
    const ledger = await computeOperatingLedger({
      start: new Date("2026-07-06T00:00:00.000Z"),
      end: new Date("2026-07-13T00:00:00.000Z"),
      store,
    })
    expect(ledger.canonical.publishedCount).toBe(1)
    expect(ledger.canonical.traceableLeadCount).toBe(1)
    expect(ledger.canonical.unknownLeadCount).toBe(1)
    expect(ledger.canonical.dealCount).toBe(1)
    expect(ledger.weekly.publishedCount).toBe(1)
  })
})

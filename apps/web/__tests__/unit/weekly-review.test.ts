import { describe, expect, it } from "vitest"
import { computeWeeklyReview, type WeeklyReviewStorePort } from "@/lib/aim/weekly-review"

// 每周经营复盘（90 天计划 3.3）：固定只看五个主指标。
// 1. 发布内容数 2. 有效线索数 3. 诊断预约数 4. 成交数与收入 5. 被重复调用的知识/案例资产数
// 原则：null 不当 0；周期外数据不计入；回填率只统计已到期的第 7 天窗口。

const USER = "user_1"
const START = new Date("2026-07-06T00:00:00.000Z")
const END = new Date("2026-07-13T00:00:00.000Z")

interface FakeGen {
  id: string
  workflowStatus: string
  publishedAt: Date | null
  createdAt: Date
  knowledgeUsed: Array<{ id: string }>
}

interface FakeOutcome {
  generationId: string
  collectWindowDay: number
  collectedAt: Date
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: number | null
  qualifiedCommentCount: number | null
  dmCount: number | null
  userVerdict: string | null
}

function makeStore(gens: FakeGen[], outcomes: FakeOutcome[]): WeeklyReviewStorePort {
  return {
    aimGeneration: {
      findMany: async () => gens,
    },
    contentOutcome: {
      findMany: async () => outcomes,
    },
  }
}

function outcome(generationId: string, overrides: Partial<FakeOutcome> = {}): FakeOutcome {
  return {
    generationId,
    collectWindowDay: 7,
    collectedAt: new Date("2026-07-08T00:00:00.000Z"),
    qualifiedLeadCount: null,
    appointmentCount: null,
    dealCount: null,
    revenue: null,
    qualifiedCommentCount: null,
    dmCount: null,
    userVerdict: null,
    ...overrides,
  }
}

describe("computeWeeklyReview", () => {
  it("发布内容数按 publishedAt 落在周期内统计", async () => {
    const gens: FakeGen[] = [
      { id: "g1", workflowStatus: "published", publishedAt: new Date("2026-07-07T10:00:00Z"), createdAt: new Date("2026-07-07T09:00:00Z"), knowledgeUsed: [] },
      { id: "g2", workflowStatus: "published", publishedAt: new Date("2026-07-12T10:00:00Z"), createdAt: new Date("2026-07-12T09:00:00Z"), knowledgeUsed: [] },
      { id: "g3", workflowStatus: "published", publishedAt: new Date("2026-06-30T10:00:00Z"), createdAt: new Date("2026-06-30T09:00:00Z"), knowledgeUsed: [] },
      { id: "g4", workflowStatus: "draft", publishedAt: null, createdAt: new Date("2026-07-08T09:00:00Z"), knowledgeUsed: [] },
    ]
    const review = await computeWeeklyReview({ userId: USER, start: START, end: END, store: makeStore(gens, []) })
    expect(review.publishedCount).toBe(2)
  })

  it("线索/预约/成交/收入只求和周期内已填值，null 不当 0", async () => {
    const outcomes = [
      outcome("g1", { qualifiedLeadCount: 3, appointmentCount: 1, dealCount: 1, revenue: 9800 }),
      outcome("g2"), // 全空：不影响求和
      outcome("g3", { qualifiedLeadCount: 2, collectedAt: new Date("2026-06-01T00:00:00.000Z") }), // 周期外
      outcome("g4", { collectWindowDay: 30, qualifiedLeadCount: 5 }), // 第 30 天窗口也计入本周收集
    ]
    const review = await computeWeeklyReview({ userId: USER, start: START, end: END, store: makeStore([], outcomes) })
    expect(review.qualifiedLeadCount).toBe(8)
    expect(review.appointmentCount).toBe(1)
    expect(review.dealCount).toBe(1)
    expect(review.revenue).toBe(9800)
  })

  it("同一内容的 7/14/30 累计快照不直接相加，取周期末最成熟窗口", async () => {
    const outcomes = [
      outcome("g1", { collectWindowDay: 7, qualifiedLeadCount: 3, appointmentCount: 1, dealCount: 0, revenue: 0 }),
      outcome("g1", {
        collectWindowDay: 14,
        qualifiedLeadCount: 5,
        appointmentCount: 2,
        dealCount: 1,
        revenue: 5000,
        collectedAt: new Date("2026-07-09T00:00:00.000Z"),
      }),
      outcome("g1", {
        collectWindowDay: 30,
        qualifiedLeadCount: 8,
        appointmentCount: 2,
        dealCount: 1,
        revenue: 9800,
        collectedAt: new Date("2026-07-10T00:00:00.000Z"),
      }),
      outcome("g2", { collectWindowDay: 7, qualifiedLeadCount: 2 }),
    ]
    const review = await computeWeeklyReview({
      userId: USER,
      start: START,
      end: END,
      store: makeStore([], outcomes),
    })
    // g1 只取 day30（8），不得 3+5+8；g2 取 day7（2）→ 合计 10
    expect(review.qualifiedLeadCount).toBe(10)
    expect(review.appointmentCount).toBe(2)
    expect(review.dealCount).toBe(1)
    expect(review.revenue).toBe(9800)
  })

  it("知识资产复用：按 knowledgeUsed 去重，≥2 次调用计入「重复调用」", async () => {
    const gens: FakeGen[] = [
      { id: "g1", workflowStatus: "published", publishedAt: new Date("2026-07-07T10:00:00Z"), createdAt: new Date("2026-07-07T09:00:00Z"), knowledgeUsed: [{ id: "k1" }, { id: "k2" }] },
      { id: "g2", workflowStatus: "draft", publishedAt: null, createdAt: new Date("2026-07-08T09:00:00Z"), knowledgeUsed: [{ id: "k1" }] },
      { id: "g3", workflowStatus: "draft", publishedAt: null, createdAt: new Date("2026-06-01T09:00:00Z"), knowledgeUsed: [{ id: "k9" }] }, // 周期外
    ]
    const review = await computeWeeklyReview({ userId: USER, start: START, end: END, store: makeStore(gens, []) })
    expect(review.referencedAssetCount).toBe(2) // k1, k2
    expect(review.reusedAssetCount).toBe(1) // 仅 k1 被调用 2 次
  })

  it("第 7 天回填率只统计到期窗口：已填/到期", async () => {
    // END=7-13；7-6 前发布 → 第 7 天窗口在周期结束前到期
    const gens: FakeGen[] = [
      { id: "due1", workflowStatus: "published", publishedAt: new Date("2026-07-01T10:00:00Z"), createdAt: new Date("2026-07-01T09:00:00Z"), knowledgeUsed: [] },
      { id: "due2", workflowStatus: "published", publishedAt: new Date("2026-07-02T10:00:00Z"), createdAt: new Date("2026-07-02T09:00:00Z"), knowledgeUsed: [] },
      { id: "fresh", workflowStatus: "published", publishedAt: new Date("2026-07-10T10:00:00Z"), createdAt: new Date("2026-07-10T09:00:00Z"), knowledgeUsed: [] }, // 未到期
    ]
    const outcomes = [
      outcome("due1", { qualifiedLeadCount: 1 }), // 已回填
      outcome("due2"), // 到期未回填
    ]
    const review = await computeWeeklyReview({ userId: USER, start: START, end: END, store: makeStore(gens, outcomes) })
    expect(review.day7Backfill).toEqual({ due: 2, filled: 1 })
  })

  it("收益为 0 是有效回填（显式填 0），不视为缺失", async () => {
    const gens: FakeGen[] = [
      { id: "due1", workflowStatus: "published", publishedAt: new Date("2026-07-01T10:00:00Z"), createdAt: new Date("2026-07-01T09:00:00Z"), knowledgeUsed: [] },
    ]
    const outcomes = [outcome("due1", { dealCount: 0 })]
    const review = await computeWeeklyReview({ userId: USER, start: START, end: END, store: makeStore(gens, outcomes) })
    expect(review.day7Backfill.filled).toBe(1)
    expect(review.dealCount).toBe(0)
  })
})

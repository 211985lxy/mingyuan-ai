import { describe, it, expect, vi } from "vitest"
import {
  computeEngagementRate,
  computeConversionRate,
  evaluateOutcomes,
  type OutcomeEvaluatorStore,
} from "@/lib/aim/outcome-evaluator"

describe("computeEngagementRate", () => {
  it("views=null → null", () => {
    expect(computeEngagementRate({ views: null, likes: 10, comments: 5, saves: 3, shares: 2 })).toBeNull()
  })

  it("views=0 → null", () => {
    expect(computeEngagementRate({ views: 0, likes: 10, comments: 5, saves: 3, shares: 2 })).toBeNull()
  })

  it("正常计算互动率（收藏加权：saves×5 + shares×3 + comments×2 + likes×1）", () => {
    const rate = computeEngagementRate({ views: 100, likes: 10, comments: 5, saves: 3, shares: 2 })
    // (3×5 + 2×3 + 5×2 + 10×1) / 100 = (15+6+10+10) / 100 = 0.41
    expect(rate).toBeCloseTo(0.41, 4)
  })

  it("收藏权重高于点赞（同样数量收藏价值是点赞的 5 倍）", () => {
    const bySaves = computeEngagementRate({ views: 100, likes: 0, comments: 0, saves: 10, shares: 0 })
    const byLikes = computeEngagementRate({ views: 100, likes: 10, comments: 0, saves: 0, shares: 0 })
    expect(bySaves).toBeCloseTo(0.5, 4) // 10×5/100
    expect(byLikes).toBeCloseTo(0.1, 4) // 10×1/100
  })

  it("null 互动字段当 0 处理", () => {
    const rate = computeEngagementRate({ views: 100, likes: 10, comments: null, saves: null, shares: null })
    expect(rate).toBeCloseTo(0.1, 4)
  })
})

describe("computeConversionRate", () => {
  it("views=null → null", () => {
    expect(computeConversionRate({ views: null, qualifiedLeadCount: 5 })).toBeNull()
  })

  it("正常计算转化率", () => {
    const rate = computeConversionRate({ views: 1000, qualifiedLeadCount: 5 })
    expect(rate).toBeCloseTo(0.005, 6)
  })

  it("qualifiedLeadCount=null → 0", () => {
    const rate = computeConversionRate({ views: 1000, qualifiedLeadCount: null })
    expect(rate).toBe(0)
  })
})

function makeOutcomeRow(overrides: Partial<{
  id: string
  generationId: string
  userId: string
  projectId: string | null
  platform: string | null
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: unknown
  userVerdict: string | null
  verdictNote: string | null
  verdictCode: string | null
  collectWindowDay: number
  collectedAt: Date
}> = {}) {
  return {
    id: "outcome_1",
    generationId: "gen_1",
    userId: "user_1",
    projectId: null as string | null,
    platform: null as string | null,
    views: null as number | null,
    likes: null as number | null,
    comments: null as number | null,
    saves: null as number | null,
    shares: null as number | null,
    qualifiedLeadCount: null as number | null,
    appointmentCount: null as number | null,
    dealCount: null as number | null,
    revenue: null as unknown,
    userVerdict: null as string | null,
    verdictNote: null as string | null,
    verdictCode: null as string | null,
    collectWindowDay: 7,
    collectedAt: new Date("2026-07-18"),
    ...overrides,
  }
}

function makeStore(
  outcomes: ReturnType<typeof makeOutcomeRow>[],
  generations: Array<{ id: string; rawCopy: string | null; videoScript: string | null; topicTitle: string | null }> = [],
  existingCandidates: Array<{ id: string }> = [],
): OutcomeEvaluatorStore {
  return {
    contentOutcome: {
      findMany: vi.fn().mockResolvedValue(outcomes),
    },
    aimGeneration: {
      findMany: vi.fn().mockResolvedValue(generations),
    },
    assetCandidate: {
      findFirst: vi.fn().mockResolvedValue(existingCandidates.length > 0 ? existingCandidates[0] : null),
      create: vi.fn().mockImplementation(() => Promise.resolve({ id: "cand_1" })),
    },
  }
}

describe("evaluateOutcomes", () => {
  it("无 ContentOutcome → evaluated=0", async () => {
    const result = await evaluateOutcomes({ userId: "user_1", store: makeStore([]) })
    expect(result.evaluated).toBe(0)
    expect(result.writtenBack).toBe(0)
  })

  it("用户标记优秀 → 写入待确认资产候选", async () => {
    const result = await evaluateOutcomes({
      userId: "user_1",
      store: makeStore(
        [makeOutcomeRow({
          id: "o1",
          projectId: "proj_1",
          verdictCode: "excellent",
          userVerdict: "这条视频效果很好，评论区很多人问价格",
          views: 500,
          likes: 30,
          qualifiedLeadCount: 2,
        })],
        [{ id: "gen_1", rawCopy: "这是一条文案", videoScript: null, topicTitle: "测试选题" }],
      ),
    })
    expect(result.excellent).toBe(1)
    expect(result.writtenBack).toBeGreaterThanOrEqual(1)
  })

  it("旧自由文本无 verdictCode → 不得仅凭备注判优秀", async () => {
    const result = await evaluateOutcomes({
      userId: "user_1",
      store: makeStore(
        [makeOutcomeRow({
          id: "o_legacy",
          projectId: "proj_1",
          userVerdict: "看起来不错",
          views: null,
          likes: null,
        })],
        [{ id: "gen_1", rawCopy: "文案", videoScript: null, topicTitle: "选题" }],
      ),
    })
    expect(result.excellent).toBe(0)
    expect(result.writtenBack).toBe(0)
  })

  it("无效码只写方法论修订候选，不计入优秀", async () => {
    const store = makeStore(
      [makeOutcomeRow({
        id: "o_bad",
        projectId: "proj_1",
        verdictCode: "ineffective",
        userVerdict: "无效",
        views: null,
      })],
      [{ id: "gen_1", rawCopy: "文案", videoScript: null, topicTitle: "警示" }],
    )
    const result = await evaluateOutcomes({ userId: "user_1", store })
    expect(result.excellent).toBe(0)
    expect(result.writtenBack).toBe(1)
    expect(store.assetCandidate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "methodology_revision" }),
      }),
    )
  })

  it("无效码优先于高互动和成交信号，只写方法论修订候选", async () => {
    const store = makeStore(
      [makeOutcomeRow({
        id: "o_bad_metrics",
        projectId: "proj_1",
        verdictCode: "ineffective",
        verdictNote: "有流量但客户不匹配",
        views: 100,
        likes: 50,
        saves: 20,
        qualifiedLeadCount: 3,
        appointmentCount: 2,
        dealCount: 1,
      })],
      [{ id: "gen_1", rawCopy: "文案", videoScript: null, topicTitle: "警示" }],
    )
    const result = await evaluateOutcomes({ userId: "user_1", store })
    expect(result.excellent).toBe(0)
    expect(result.writtenBack).toBe(1)
    expect(result.skipped).toBe(0)
    expect(store.assetCandidate.create).toHaveBeenCalledTimes(1)
    expect(store.assetCandidate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "methodology_revision" }),
      }),
    )
  })

  it("无 projectId → 跳过候选", async () => {
    const result = await evaluateOutcomes({
      userId: "user_1",
      store: makeStore(
        [makeOutcomeRow({ id: "o_noproj", projectId: null, verdictCode: "excellent", userVerdict: "优秀", views: 100, likes: 10 })],
        [{ id: "gen_1", rawCopy: "文案", videoScript: null, topicTitle: "选题" }],
      ),
    })
    expect(result.excellent).toBe(1)
    expect(result.writtenBack).toBe(0)
    expect(result.skipped).toBeGreaterThanOrEqual(1)
    expect(result.errors.some((item) => item.includes("skip outcome without projectId"))).toBe(true)
  })

  it("写入路径走 assetCandidate.create，不写 knowledgeEntry", async () => {
    const store = makeStore(
      [makeOutcomeRow({
        id: "o_cand",
        projectId: "proj_1",
        verdictCode: "effective",
        userVerdict: "有效",
        views: 200,
        likes: 20,
        qualifiedLeadCount: 3,
        dealCount: 1,
      })],
      [{ id: "gen_1", rawCopy: "成稿", videoScript: null, topicTitle: "成交案例" }],
    )
    const result = await evaluateOutcomes({ userId: "user_1", store })
    expect(result.writtenBack).toBeGreaterThanOrEqual(1)
    expect(store.assetCandidate.create).toHaveBeenCalled()
    expect(store).not.toHaveProperty("knowledgeEntry")
  })

  it("AimGeneration 不存在 → 记录错误", async () => {
    const result = await evaluateOutcomes({
      userId: "user_1",
      store: makeStore(
        [makeOutcomeRow({ id: "o5", projectId: "proj_1", verdictCode: "excellent", userVerdict: "好", generationId: "missing_gen" })],
        [],
      ),
    })
    expect(result.excellent).toBe(1)
    expect(result.writtenBack).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("多条混合 → 正确分类", async () => {
    const result = await evaluateOutcomes({
      userId: "user_1",
      store: makeStore(
        [
          makeOutcomeRow({ id: "o_a", projectId: "proj_1", verdictCode: "excellent", userVerdict: "好", views: 100, likes: 5, qualifiedLeadCount: 1 }),
          makeOutcomeRow({ id: "o_b", projectId: "proj_1", views: 200, likes: 20, comments: 5, saves: 3, shares: 2, dealCount: 1 }),
          makeOutcomeRow({ id: "o_c", projectId: "proj_1", views: 1000, likes: 5 }),
          makeOutcomeRow({ id: "o_d", projectId: "proj_1", userVerdict: null, views: null, likes: null }),
        ],
        [{ id: "gen_1", rawCopy: "文案A", videoScript: null, topicTitle: "TA" }],
      ),
    })
    expect(result.evaluated).toBe(4)
    expect(result.excellent).toBe(2)
    expect(result.skipped).toBe(2)
  })
})

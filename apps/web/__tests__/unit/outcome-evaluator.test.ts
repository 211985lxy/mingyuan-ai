import { describe, it, expect, vi } from "vitest"
import {
  computeEngagementRate,
  computeConversionRate,
  evaluateOutcomes,
  type OutcomeEvaluatorStore,
} from "@/lib/aim/outcome-evaluator"

// ── 纯函数测试 ────────────────────────────────────────────

describe("computeEngagementRate", () => {
  it("views=null → null", () => {
    expect(computeEngagementRate({ views: null, likes: 10, comments: 5, saves: 3, shares: 2 })).toBeNull()
  })

  it("views=0 → null", () => {
    expect(computeEngagementRate({ views: 0, likes: 10, comments: 5, saves: 3, shares: 2 })).toBeNull()
  })

  it("正常计算互动率", () => {
    // (10 + 5 + 3 + 2) / 100 = 0.20
    const rate = computeEngagementRate({ views: 100, likes: 10, comments: 5, saves: 3, shares: 2 })
    expect(rate).toBeCloseTo(0.2, 4)
  })

  it("null 互动字段当 0 处理", () => {
    // (10 + 0 + 0 + 0) / 100 = 0.10
    const rate = computeEngagementRate({ views: 100, likes: 10, comments: null, saves: null, shares: null })
    expect(rate).toBeCloseTo(0.1, 4)
  })
})

describe("computeConversionRate", () => {
  it("views=null → null", () => {
    expect(computeConversionRate({ views: null, qualifiedLeadCount: 5 })).toBeNull()
  })

  it("正常计算转化率", () => {
    // 5 / 1000 = 0.005
    const rate = computeConversionRate({ views: 1000, qualifiedLeadCount: 5 })
    expect(rate).toBeCloseTo(0.005, 6)
  })

  it("qualifiedLeadCount=null → 0", () => {
    const rate = computeConversionRate({ views: 1000, qualifiedLeadCount: null })
    expect(rate).toBe(0)
  })
})

// ── evaluateOutcomes 集成测试 ──────────────────────────────

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
  collectWindowDay: number
  collectedAt: Date
}> = {}) {
  return {
    id: "outcome_1",
    generationId: "gen_1",
    userId: "user_1",
    projectId: null,
    platform: null,
    views: null,
    likes: null,
    comments: null,
    saves: null,
    shares: null,
    qualifiedLeadCount: null,
    appointmentCount: null,
    dealCount: null,
    revenue: null,
    userVerdict: null,
    collectWindowDay: 7,
    collectedAt: new Date("2026-07-18"),
    ...overrides,
  }
}

function makeStore(
  outcomes: ReturnType<typeof makeOutcomeRow>[],
  generations: Array<{ id: string; rawCopy: string | null; videoScript: string | null; topicTitle: string | null }> = [],
  existingEntries: Array<{ id: string }> = [],
): OutcomeEvaluatorStore {
  const createdEntries: Array<{ data: Record<string, unknown> }> = []

  return {
    contentOutcome: {
      findMany: vi.fn().mockResolvedValue(outcomes),
    },
    aimGeneration: {
      findMany: vi.fn().mockResolvedValue(generations),
    },
    knowledgeEntry: {
      findFirst: vi.fn().mockResolvedValue(existingEntries.length > 0 ? existingEntries[0] : null),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        createdEntries.push(args)
        return Promise.resolve({ id: `entry_${createdEntries.length}` })
      }),
    },
  }
}

describe("evaluateOutcomes", () => {
  it("无 ContentOutcome → evaluated=0", async () => {
    const store = makeStore([])
    const result = await evaluateOutcomes({ userId: "user_1", store })
    expect(result.evaluated).toBe(0)
    expect(result.excellent).toBe(0)
    expect(result.writtenBack).toBe(0)
  })

  it("用户标记优秀 → 写入知识库", async () => {
    const outcomes = [
      makeOutcomeRow({
        id: "o1",
        userVerdict: "这条视频效果很好，评论区很多人问价格",
        views: 500,
        likes: 30,
      }),
    ]
    const generations = [
      { id: "gen_1", rawCopy: "这是一条文案", videoScript: null, topicTitle: "测试选题" },
    ]
    const store = makeStore(outcomes, generations)

    const result = await evaluateOutcomes({ userId: "user_1", store })

    expect(result.evaluated).toBe(1)
    expect(result.excellent).toBe(1)
    expect(result.writtenBack).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it("互动率超 5% → 写入知识库", async () => {
    const outcomes = [
      makeOutcomeRow({
        id: "o2",
        views: 1000,
        likes: 40, // 4%
        comments: 10, // 1%
        saves: 5,
        shares: 5,
        // 总互动率 = 60/1000 = 6% > 5%
      }),
    ]
    const generations = [
      { id: "gen_1", rawCopy: null, videoScript: "最终文案", topicTitle: null },
    ]
    const store = makeStore(outcomes, generations)

    const result = await evaluateOutcomes({ userId: "user_1", store })

    expect(result.excellent).toBe(1)
    expect(result.writtenBack).toBe(1)
  })

  it("互动率不足且无用户判断 → 跳过", async () => {
    const outcomes = [
      makeOutcomeRow({
        id: "o3",
        views: 1000,
        likes: 10, // 1% < 5%
        comments: null,
        saves: null,
        shares: null,
      }),
    ]
    const store = makeStore(outcomes)

    const result = await evaluateOutcomes({ userId: "user_1", store })

    expect(result.evaluated).toBe(1)
    expect(result.excellent).toBe(0)
    expect(result.writtenBack).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it("已存在的知识条目 → 幂等跳过", async () => {
    const outcomes = [
      makeOutcomeRow({
        id: "o4",
        userVerdict: "优秀",
        views: 100,
        likes: 10,
      }),
    ]
    const generations = [
      { id: "gen_1", rawCopy: "文案", videoScript: null, topicTitle: "T" },
    ]
    // 模拟已有同名条目
    const store = makeStore(outcomes, generations, [{ id: "existing_entry" }])

    const result = await evaluateOutcomes({ userId: "user_1", store })

    expect(result.excellent).toBe(1)
    expect(result.writtenBack).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it("AimGeneration 不存在 → 记录错误", async () => {
    const outcomes = [
      makeOutcomeRow({
        id: "o5",
        userVerdict: "好",
        generationId: "missing_gen",
      }),
    ]
    const store = makeStore(outcomes, []) // 空 generations

    const result = await evaluateOutcomes({ userId: "user_1", store })

    expect(result.excellent).toBe(1)
    expect(result.writtenBack).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("ensureEmbedding 被调用", async () => {
    const outcomes = [
      makeOutcomeRow({
        id: "o6",
        userVerdict: "好",
        views: 100,
        likes: 10,
      }),
    ]
    const generations = [
      { id: "gen_1", rawCopy: "文案", videoScript: null, topicTitle: "T" },
    ]
    const store = makeStore(outcomes, generations)
    const ensureEmbedding = vi.fn().mockResolvedValue(undefined)

    await evaluateOutcomes({ userId: "user_1", store, ensureEmbedding })

    expect(ensureEmbedding).toHaveBeenCalled()
  })

  it("多条混合 → 正确分类", async () => {
    const outcomes = [
      // 优秀（用户标记）
      makeOutcomeRow({ id: "o_a", userVerdict: "好", views: 100, likes: 5 }),
      // 优秀（互动率高）
      makeOutcomeRow({ id: "o_b", views: 200, likes: 20, comments: 5, saves: 3, shares: 2 }),
      // 不优秀
      makeOutcomeRow({ id: "o_c", views: 1000, likes: 5 }),
      // 无 views
      makeOutcomeRow({ id: "o_d", userVerdict: null, views: null, likes: null }),
    ]
    const generations = [
      { id: "gen_1", rawCopy: "文案A", finalizedCopy: null, topicTitle: "TA" },
    ]
    const store = makeStore(outcomes, generations)

    const result = await evaluateOutcomes({ userId: "user_1", store })

    expect(result.evaluated).toBe(4)
    expect(result.excellent).toBe(2)
    expect(result.skipped).toBe(2)
  })
})

import { describe, it, expect, vi } from "vitest"
import {
  getTopPerformingScripts,
  buildTopPerformerSection,
  type OutcomeHistoryStore,
} from "@/lib/aim/outcome-history"

function makeRow(overrides: Partial<{
  id: string
  generationId: string
  platform: string | null
  collectWindowDay: number
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  qualifiedLeadCount: number | null
  dealCount: number | null
  revenue: unknown
  userVerdict: string | null
  verdictNote: string | null
  verdictCode: string | null
  generation: {
    id: string
    rawCopy: string | null
    videoScript: string | null
    topicTitle: string | null
  } | null
}> = {}) {
  return {
    id: "o1",
    generationId: "gen1",
    platform: null,
    collectWindowDay: 7,
    views: 1000,
    likes: 50,
    comments: 10,
    saves: 5,
    shares: 5,
    qualifiedLeadCount: null,
    dealCount: null,
    revenue: null,
    userVerdict: null,
    verdictNote: null,
    verdictCode: null,
    generation: {
      id: "gen1",
      rawCopy: "这是文案原文",
      videoScript: null,
      topicTitle: "测试选题",
    },
    ...overrides,
  }
}

function makeStore(rows: ReturnType<typeof makeRow>[]): OutcomeHistoryStore {
  return {
    contentOutcome: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  }
}

describe("getTopPerformingScripts", () => {
  it("无数据 → 空数组", async () => {
    const store = makeStore([])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result).toEqual([])
  })

  it("互动率 < 1% 且无 userVerdict → 过滤掉", async () => {
    const store = makeStore([
      makeRow({ views: 10000, likes: 5, userVerdict: null }), // 0.05% < 1%
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result).toHaveLength(0)
  })

  it("互动率 >= 1% → 返回", async () => {
    const store = makeStore([
      makeRow({ views: 1000, likes: 20, comments: 0, saves: 0, shares: 0 }), // 2% > 1%
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result).toHaveLength(1)
    expect(result[0].engagementRate).toBeCloseTo(0.02, 4)
  })

  it("旧 userVerdict 但互动率低 → 不得自动升级为最佳表现", async () => {
    const store = makeStore([
      makeRow({
        views: 100,
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0,
        userVerdict: "用户说很好",
      }),
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result).toHaveLength(0)
  })

  it("按互动率降序排列", async () => {
    const store = makeStore([
      makeRow({ id: "low", generationId: "g1", views: 1000, likes: 20, generation: { id: "g1", rawCopy: "低", videoScript: null, topicTitle: "T1" } }),
      makeRow({ id: "high", generationId: "g2", views: 1000, likes: 100, generation: { id: "g2", rawCopy: "高", videoScript: null, topicTitle: "T2" } }),
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result[0].generationId).toBe("g2") // 高互动率排前
    expect(result[1].generationId).toBe("g1")
  })

  it("收藏加权：相同点赞下收藏更多的视频互动率更高、排更前", async () => {
    const store = makeStore([
      // 仅点赞：100 → 互动率 100×1/1000 = 0.1
      makeRow({ id: "likes_only", generationId: "g_likes", views: 1000, likes: 100, comments: 0, saves: 0, shares: 0, generation: { id: "g_likes", rawCopy: "纯点赞", videoScript: null, topicTitle: "TL" } }),
      // 点赞少但收藏多：30 收藏 → 30×5/1000 = 0.15 > 0.1
      makeRow({ id: "saves_heavy", generationId: "g_saves", views: 1000, likes: 0, comments: 0, saves: 30, shares: 0, generation: { id: "g_saves", rawCopy: "高收藏", videoScript: null, topicTitle: "TS" } }),
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result[0].generationId).toBe("g_saves") // 收藏权重高，反超纯点赞
    expect(result[0].engagementRate).toBeCloseTo(0.15, 4)
  })

  it("有正向 verdictCode 的优先排前（即使互动率更低）", async () => {
    const store = makeStore([
      // 无码、纯靠互动率：likes=100
      makeRow({ id: "no_code", generationId: "g1", views: 1000, likes: 100, verdictCode: null, generation: { id: "g1", rawCopy: "A", videoScript: null, topicTitle: "T1" } }),
      // 有正向码 excellent，但点赞更少 → 应因 verdictCode 正向而排前
      makeRow({ id: "with_code", generationId: "g2", views: 1000, likes: 50, verdictCode: "excellent", generation: { id: "g2", rawCopy: "B", videoScript: null, topicTitle: "T2" } }),
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result[0].generationId).toBe("g2") // 有正向 verdictCode 优先
  })

  it("文案截断 500 字", async () => {
    const longCopy = "x".repeat(800)
    const store = makeStore([
      makeRow({ generation: { id: "g1", rawCopy: longCopy, videoScript: null, topicTitle: "T" } }),
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result[0].copyExcerpt.length).toBe(500)
  })

  it("无文案的记录 → 跳过", async () => {
    const store = makeStore([
      makeRow({ generation: { id: "g1", rawCopy: null, videoScript: null, topicTitle: "T" } }),
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result).toHaveLength(0)
  })

  it("limit 生效", async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow({
        id: `o${i}`,
        generationId: `g${i}`,
        views: 1000,
        likes: 50 + i,
        generation: { id: `g${i}`, rawCopy: `文案${i}`, videoScript: null, topicTitle: `T${i}` },
      }),
    )
    const store = makeStore(rows)
    const result = await getTopPerformingScripts({ userId: "u1", store, limit: 3 })
    expect(result).toHaveLength(3)
  })
})

describe("buildTopPerformerSection", () => {
  it("空数组 → 空字符串", () => {
    expect(buildTopPerformerSection([])).toBe("")
  })

  it("包含标题和效果数据", () => {
    const performers = [
      {
        generationId: "g1",
        copyExcerpt: "这是文案",
        topicTitle: "测试",
        platform: "douyin",
        views: 1000,
        likes: 50,
        comments: 10,
        saves: null,
        shares: null,
        qualifiedLeadCount: 5,
        dealCount: 1,
        revenue: 1000,
        engagementRate: 0.06,
        conversionRate: 0.005,
        userVerdict: null,
        verdictNote: null,
        verdictCode: null,
      },
    ]
    const section = buildTopPerformerSection(performers)
    expect(section).toContain("历史最佳表现文案参考")
    expect(section).toContain("测试")
    expect(section).toContain("播放 1000")
    expect(section).toContain("点赞 50")
    expect(section).toContain("互动率 6.0%")
    expect(section).toContain("这是文案")
  })
})

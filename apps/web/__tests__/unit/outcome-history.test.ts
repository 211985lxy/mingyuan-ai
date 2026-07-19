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

  it("有 userVerdict 但互动率低 → 仍返回", async () => {
    const store = makeStore([
      makeRow({ views: 100, likes: 0, userVerdict: "用户说很好" }),
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result).toHaveLength(1)
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

  it("有 userVerdict 的优先排前", async () => {
    const store = makeStore([
      makeRow({ id: "no_verdict", generationId: "g1", views: 1000, likes: 100, userVerdict: null, generation: { id: "g1", rawCopy: "A", videoScript: null, topicTitle: "T1" } }),
      makeRow({ id: "with_verdict", generationId: "g2", views: 1000, likes: 50, userVerdict: "好", generation: { id: "g2", rawCopy: "B", videoScript: null, topicTitle: "T2" } }),
    ])
    const result = await getTopPerformingScripts({ userId: "u1", store })
    expect(result[0].generationId).toBe("g2") // 有 userVerdict 优先
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

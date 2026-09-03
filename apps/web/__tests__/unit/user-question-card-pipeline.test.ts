import { describe, expect, it, vi, beforeEach } from "vitest"

// ── hoist mock modules（与 inspiration-events.test.ts 同样模式） ──
const runtimeEnv = vi.hoisted(() => ({}))
vi.mock("@/env", () => ({ env: runtimeEnv }))

const prismaMock = vi.hoisted(() => ({
  userQuestionCard: {
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

import {
  isQuestionOrDemand,
  generateSimilarityGroupKey,
  normalizeQuestionAndUpsertCard,
  cleanOriginalText,
  truncateSnippet,
  afterInspirationCreatedProcessQuestion,
} from "@/features/topics/services/user-question-normalize"

// 4 条测试消息：
//   m1/m2/m3 = 同一个核心问题「怎么降低获客成本」+ 不同平台装饰（@mention / emoji / link）
//              装饰会被 cleanOriginalText + CHINESE_ONLY_RE 滤掉，核心 bigram 完全一致 → 同一张卡
//   m4       = 完全不同的问题「如何做小红书封面设计」→ 另一张卡
const M1 = "怎么降低获客成本？"
const M2 = "@张三 怎么降低获客成本？ 👉 https://example.com/ref 😅"
const M3 = "FWD: 怎么降低获客成本？ (via @助手) 💯💬"
const M4 = "如何做小红书封面设计？想要高点击率那种风格"

describe("isQuestionOrDemand 分类器", () => {
  it("识别问句（问号 & 关键词）", () => {
    expect(isQuestionOrDemand(M1)).toBe(true)
    expect(isQuestionOrDemand(M4)).toBe(true)
  })
  it("识别诉求型表达", () => {
    expect(isQuestionOrDemand("求推荐几个能有效降低获客成本的办法")).toBe(true) // 含「求推荐」
    expect(isQuestionOrDemand("我想做一个自己的品牌账号")).toBe(true)
    expect(isQuestionOrDemand("咨询一下怎么写短视频脚本")).toBe(true)
  })
  it("拒绝纯陈述句", () => {
    expect(isQuestionOrDemand("今天天气不错")).toBe(false)
    expect(isQuestionOrDemand("刚刚发了一个作品")).toBe(false)
    expect(isQuestionOrDemand("")).toBe(false)
  })
})

describe("cleanOriginalText 清洗", () => {
  it("移除 @mention、链接、emoji（不影响核心问题）", () => {
    const clean1 = cleanOriginalText(M1)
    const clean2 = cleanOriginalText(M2)
    const clean3 = cleanOriginalText(M3)
    expect(clean2).not.toContain("@")
    expect(clean2).not.toContain("https://")
    expect(clean3).not.toContain("@")
    // 三者清理后都包含核心
    expect(clean1).toContain("怎么降低获客成本")
    expect(clean2).toContain("怎么降低获客成本")
    expect(clean3).toContain("怎么降低获客成本")
  })
})

describe("generateSimilarityGroupKey 签名稳定性", () => {
  it("3 条「降低获客成本」变体（装饰不同）生成相同 signature", () => {
    const k1 = generateSimilarityGroupKey(M1)
    const k2 = generateSimilarityGroupKey(M2)
    const k3 = generateSimilarityGroupKey(M3)
    expect(k1).toBeTruthy()
    expect(k1).toHaveLength(16) // 16 hex chars
    expect(k1).toBe(k2)
    expect(k2).toBe(k3)
  })

  it("与「小红书封面设计」生成不同 signature", () => {
    const kCost = generateSimilarityGroupKey(M1)
    const kXhs = generateSimilarityGroupKey(M4)
    expect(kXhs).toBeTruthy()
    expect(kXhs).toHaveLength(16)
    expect(kCost).not.toBe(kXhs)
  })

  it("内容太短或停用词不足时返回 null", () => {
    // 你 + 好 都是停用词 → 过滤后不足 2 个有效 bigram
    expect(generateSimilarityGroupKey("你好")).toBeNull()
    expect(generateSimilarityGroupKey("")).toBeNull()
    expect(generateSimilarityGroupKey("Hello world")).toBeNull() // 无中文
  })
})

describe("normalizeQuestionAndUpsertCard 聚合管线", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("4 次调用 → 2 张卡：occurrenceCount=3 & 1；snippets=3 & 1", async () => {
    // 先预计算每个场景的 similarityGroupKey（用于最终断言）
    const keyCost = generateSimilarityGroupKey(M1)!
    const keyXhs = generateSimilarityGroupKey(M4)!
    expect(keyCost).not.toBe(keyXhs)
    expect(keyCost).toBe(generateSimilarityGroupKey(M2))
    expect(keyCost).toBe(generateSimilarityGroupKey(M3))

    // 模拟一个内存"伪数据库"，验证 Prisma 调用语义
    type Card = {
      id: string
      userId: string
      occurrenceCount: number
      userQuoteSnippets: string[]
      similarityGroupKey: string
    }
    const cardsById = new Map<string, Card>()
    let nextCardId = 0

    // findFirst：按 (userId, similarityGroupKey) 查询
    prismaMock.userQuestionCard.findFirst.mockImplementation(async ({ where }: any) => {
      for (const c of cardsById.values()) {
        if (c.userId === where.userId && c.similarityGroupKey === where.similarityGroupKey) {
          return {
            id: c.id,
            occurrenceCount: c.occurrenceCount,
            userQuoteSnippets: [...c.userQuoteSnippets],
          }
        }
      }
      return null
    })

    // create：写新卡
    prismaMock.userQuestionCard.create.mockImplementation(async ({ data }: any) => {
      const id = `card-${++nextCardId}`
      cardsById.set(id, {
        id,
        userId: data.userId,
        occurrenceCount: data.occurrenceCount,
        userQuoteSnippets: [...(data.userQuoteSnippets as string[])],
        similarityGroupKey: data.similarityGroupKey,
      })
      return { id }
    })

    // update：累加 occurrenceCount，直接替换 snippets 数组
    //   注：生产代码 data.userQuoteSnippets 传的是 concat 后的完整新值（replace 语义）
    prismaMock.userQuestionCard.update.mockImplementation(async ({ where, data }: any) => {
      const card = cardsById.get(where.id)!
      const increment =
        typeof data.occurrenceCount === "object" && "increment" in data.occurrenceCount
          ? (data.occurrenceCount.increment as number)
          : 0
      card.occurrenceCount += increment
      card.userQuoteSnippets = [...(data.userQuoteSnippets as string[])]
      return { id: card.id }
    })

    // ── 执行 4 次管线（不同 source、不同装饰消息、不同 projectId 风格） ──
    const userId = "user-001"
    const projectId = "proj-001"

    const id1 = await normalizeQuestionAndUpsertCard({
      userId, projectId, inspiration: { content: M1, source: "feishu" },
    })
    const id2 = await normalizeQuestionAndUpsertCard({
      userId, projectId, inspiration: { content: M2, source: "community" },
    })
    const id3 = await normalizeQuestionAndUpsertCard({
      userId, projectId: null, inspiration: { content: M3, source: "feishu" },
    })
    const id4 = await normalizeQuestionAndUpsertCard({
      userId, projectId, inspiration: { content: M4, source: "comment" },
    })

    // ── 断言 1：id1 === id2 === id3 (相似合并)，id4 不同 ──
    expect(id1).toBeTruthy()
    expect(id1).toBe(id2)
    expect(id2).toBe(id3)
    expect(id4).toBeTruthy()
    expect(id4).not.toBe(id1)

    // ── 断言 2：总卡数 = 2 ──
    const allCards = Array.from(cardsById.values())
    expect(allCards).toHaveLength(2)

    // ── 断言 3：相似卡 occurrenceCount=3 且 snippets.length=3 ──
    const costCard = allCards.find((c) => c.similarityGroupKey === keyCost)!
    expect(costCard).toBeDefined()
    expect(costCard.occurrenceCount).toBe(3)
    expect(costCard.userQuoteSnippets).toHaveLength(3)

    // ── 断言 4：差异卡 occurrenceCount=1 且 snippets.length=1 ──
    const xhsCard = allCards.find((c) => c.similarityGroupKey === keyXhs)!
    expect(xhsCard).toBeDefined()
    expect(xhsCard.occurrenceCount).toBe(1)
    expect(xhsCard.userQuoteSnippets).toHaveLength(1)

    // ── 断言 5：每段 snippet 都经过 <=200 字截断 ──
    for (const c of allCards) {
      for (const s of c.userQuoteSnippets) {
        expect(s.length).toBeLessThanOrEqual(200)
      }
    }
  })

  it("非问句/非诉求 → 不建卡，return null，不调用 Prisma", async () => {
    const result = await normalizeQuestionAndUpsertCard({
      userId: "u1",
      inspiration: { content: "今天去爬山了天气真好", source: "feishu" },
    })
    expect(result).toBeNull()
    expect(prismaMock.userQuestionCard.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.userQuestionCard.create).not.toHaveBeenCalled()
    expect(prismaMock.userQuestionCard.update).not.toHaveBeenCalled()
  })

  it("Prisma 异常 → 管线不抛错，return null（容错吞掉）", async () => {
    // 故意让 Prisma findFirst 抛出（模拟 DB 故障）
    prismaMock.userQuestionCard.findFirst.mockRejectedValueOnce(
      new Error("DB_CONNECTION_LOST"),
    )

    let thrown: unknown = null
    let result: string | null = "__unset__"
    try {
      result = await normalizeQuestionAndUpsertCard({
        userId: "u-fail",
        projectId: "p-fail",
        inspiration: { content: "怎么降低获客成本？", source: "feishu" },
      })
    } catch (e) {
      thrown = e
    }

    // 关键断言：
    // 1. 不向上抛异常
    expect(thrown).toBeNull()
    // 2. 返回 null
    expect(result).toBeNull()
    // 3. findFirst 确实被调用过一次（证明进入了 Prisma 层而非之前短路）
    expect(prismaMock.userQuestionCard.findFirst).toHaveBeenCalledTimes(1)
  })

  it("afterInspirationCreatedProcessQuestion 完全不抛异常", async () => {
    prismaMock.userQuestionCard.findFirst.mockRejectedValueOnce(
      new Error("Simulated persistence failure"),
    )

    // 外层包裹：即使内部层层报错，调用方也不会收到异常
    let thrown: unknown = null
    try {
      await afterInspirationCreatedProcessQuestion({
        id: "insp-001",
        userId: "u1",
        projectId: "p1",
        content: "怎么降低获客成本？",
        source: "feishu",
      })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeNull()
  })
})

describe("truncateSnippet 边界", () => {
  it("200 字及以内不截断", () => {
    const short = "你好世界"
    expect(truncateSnippet(short, 200)).toBe(short)
  })

  it("超 200 字时截断并加省略号（结尾 …）", () => {
    const longer = "降低获客成本的有效方法分析与案例拆解报告".repeat(20) // 14*20 = 280 chars
    const t = truncateSnippet(longer, 200)
    expect(t.length).toBeLessThanOrEqual(200)
    expect(t.endsWith("…")).toBe(true)
  })
})

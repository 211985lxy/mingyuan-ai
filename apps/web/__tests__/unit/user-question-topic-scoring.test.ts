import { describe, expect, it } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import { applyUserQuestionBoost } from "@/lib/topic-generation"
import { normalizeScoreBreakdown } from "@/lib/topic-card-normalization"

/**
 * 构造一个最小可用的 Prisma mock（只实现 userQuestionCard.findMany 即可）。
 * 使用 any 类型断言绕开 PrismaClient 上百个 delegate 字段的构造成本。
 */
function buildMockPrisma(questionCards: Array<{ id: string; occurrenceCount: number; originalText: string }>) {
  return {
    userQuestionCard: {
      findMany: async (args: unknown) => {
        // 简单实现 where.userId + occurrenceCount >= 3 语义
        return questionCards
          .filter((q) => q.occurrenceCount >= 3)
          .map((q) => ({ id: q.id, originalText: q.originalText }))
      },
    },
  } as unknown as PrismaClient
}

const Q1 = {
  id: "q_high_value_001",
  occurrenceCount: 5,
  originalText: "怎么降低获客成本，投放越来越贵，线索也少",
}

describe("applyUserQuestionBoost (Task 4 需求侧加权)", () => {
  it("T1 命中：关键词 >=2 命中 → projectFit +15 (60→75)，附加 userQuestionBoost=true 与 matchedQuestionIds", async () => {
    const mockPrisma = buildMockPrisma([Q1])
    const base = {
      projectFit: 60,
      contentValue: 80,
      viralHook: 70,
      conversionFit: 75,
      feasibility: 90,
    }
    const result = await applyUserQuestionBoost(
      base,
      "获客成本越来越高怎么办？教你 3 招 ROI 翻倍",
      "从投放入手优化",
      "u1",
      mockPrisma,
    )

    expect(result.projectFit).toBe(75)
    expect(result.userQuestionBoost).toBe(true)
    expect(Array.isArray(result.matchedQuestionIds)).toBe(true)
    expect((result.matchedQuestionIds ?? []).length).toBeGreaterThanOrEqual(1)
    expect(result.matchedQuestionIds).toContain(Q1.id)
  })

  it("T2 未命中基线：不相关标题 + 理由 → projectFit 不变，不附加 userQuestionBoost", async () => {
    const mockPrisma = buildMockPrisma([Q1])
    const base = {
      projectFit: 60,
      contentValue: 80,
      viralHook: 70,
      conversionFit: 75,
      feasibility: 90,
    }
    const result = await applyUserQuestionBoost(
      base,
      "AI 工具推荐合集 2026",
      "效率工具合集",
      "u1",
      mockPrisma,
    )

    expect(result.projectFit).toBe(60)
    expect((result as any).userQuestionBoost).toBeUndefined()
    expect((result as any).matchedQuestionIds).toBeUndefined()
  })

  it("T3 边界：projectFit=92 命中时 → 封顶 100 (不超过 100)", async () => {
    const mockPrisma = buildMockPrisma([Q1])
    const base = {
      projectFit: 92,
      contentValue: 90,
      viralHook: 85,
      conversionFit: 80,
      feasibility: 88,
    }
    const result = await applyUserQuestionBoost(
      base,
      "获客成本越来越高怎么办？教你 3 招 ROI 翻倍",
      "从投放入手优化线索获取效率",
      "u1",
      mockPrisma,
    )

    expect(result.projectFit).toBe(100)
    expect(result.userQuestionBoost).toBe(true)
    expect((result.matchedQuestionIds ?? []).length).toBeGreaterThanOrEqual(1)
  })
})

describe("normalizeScoreBreakdown (Task 4 兼容新旧字段)", () => {
  it("T4a 含新字段输入 → 输出保留 userQuestionBoost 与 matchedQuestionIds，且五维合法", () => {
    const input = {
      userQuestionBoost: true as const,
      matchedQuestionIds: ["q1", "q2"],
      projectFit: 75,
      contentValue: 80,
      viralHook: 70,
      conversionFit: 75,
      feasibility: 90,
    }
    const out = normalizeScoreBreakdown(input)
    expect(out.userQuestionBoost).toBe(true)
    expect(out.matchedQuestionIds).toEqual(["q1", "q2"])
    expect(out.projectFit).toBe(75)
    expect(out.feasibility).toBe(90)
  })

  it("T4b 缺其他字段仅带新字段 → 仍能输出合法 projectFit/weighted 结构，新字段保留", () => {
    const input = {
      userQuestionBoost: true as const,
      matchedQuestionIds: ["q1"],
    }
    const out = normalizeScoreBreakdown(input as any)
    expect(out.userQuestionBoost).toBe(true)
    expect(out.matchedQuestionIds).toEqual(["q1"])
    // 旧字段依然被 clamp 为 null（不是 undefined 或 NaN），保持旧数据回读不报错
    expect(out.projectFit).toBeNull()
    expect(out.contentValue).toBeNull()
    expect(out.viralHook).toBeNull()
    expect(out.conversionFit).toBeNull()
    expect(out.feasibility).toBeNull()
  })

  it("T4c 不含新字段的旧 scoreBreakdown → 输出也不附带新字段", () => {
    const out = normalizeScoreBreakdown({
      projectFit: 60,
      contentValue: 70,
      viralHook: 80,
      conversionFit: 50,
      feasibility: 90,
    })
    expect("userQuestionBoost" in out).toBe(false)
    expect("matchedQuestionIds" in out).toBe(false)
    expect(out.projectFit).toBe(60)
  })
})

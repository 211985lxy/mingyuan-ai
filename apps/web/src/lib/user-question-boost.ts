/**
 * 用户问题库 → 选题评分加权（确定性后处理，不依赖 LLM prompt）。
 *
 * 从 topic-generation.ts 拆出以遵守模块 ≤ 500 行约束。
 * 纯函数 + Prisma 只读，任何错误都回退为原 scoreBreakdown，绝不影响主流程。
 */

import type { PrismaClient } from "@/generated/prisma/client"
import type { ScoreBreakdownNullable } from "@/lib/topic-card-normalization"

export type ScoreBreakdown = ScoreBreakdownNullable & {
  userQuestionBoost?: true
  matchedQuestionIds?: string[]
}

/** 宽松中间类型：允许部分字段缺失（原始 scoreBreakdown 可能不含全部字段） */
type LooseScoreBreakdown = Partial<ScoreBreakdownNullable> & {
  userQuestionBoost?: true
  matchedQuestionIds?: string[]
}

// ── 中文停用词（双字词滑窗噪声过滤，复用 Task 3 用户问题卡签名逻辑） ──
const USER_QUESTION_STOP_CHARS = new Set([
  "的", "了", "是", "在", "和", "与", "我", "你", "他", "她",
  "这", "那", "也", "就", "都", "还", "啊", "吧", "呢", "吗",
  "之", "及", "等", "并", "或", "一", "个", "上", "下", "中",
  "对", "从", "到", "把", "给", "向", "跟", "被", "让", "于",
  "以", "为", "因", "但", "而", "如", "若", "虽", "然", "且",
  "又", "再", "已", "曾", "将", "正", "刚", "才", "只", "更",
  "最", "很", "非", "太", "真", "好", "多", "少", "大", "小",
  "没", "不", "会", "能", "要", "可", "应", "该", "需", "必",
  "当", "每", "各", "某", "另", "其", "此", "彼",
])

const CHINESE_ONLY_RE_USER_QUESTION = /[^\u4e00-\u9fa5]/g

/**
 * 提取中文文本 Top K 双字词关键词：
 * - 仅保留中文字符
 * - 2 字滑窗构造双字词
 * - 任一字符命中停用词 → 丢弃
 * - 按词频 desc、字典序 asc 稳定排序
 * - 默认返回 Top 4（任务要求）
 */
export function extractKeywords(text: string | null | undefined, topK = 4): string[] {
  if (!text) return []
  const chinese = String(text).replace(CHINESE_ONLY_RE_USER_QUESTION, "")
  if (chinese.length < 2) return []

  const bigramCounts = new Map()
  for (let i = 0; i < chinese.length - 1; i++) {
    const a = chinese[i]
    const b = chinese[i + 1]
    if (USER_QUESTION_STOP_CHARS.has(a) || USER_QUESTION_STOP_CHARS.has(b)) continue
    const key = a + b
    bigramCounts.set(key, (bigramCounts.get(key) ?? 0) + 1)
  }

  const sorted = Array.from(bigramCounts.entries()).sort((x, y) => {
    const cnt = y[1] - x[1]
    return cnt !== 0 ? cnt : x[0].localeCompare(y[0])
  })

  return sorted.slice(0, topK).map((entry) => entry[0])
}

/**
 * 需求侧加权（确定性后处理，不依赖 LLM prompt）：
 * - 读取当前租户 userId 下 occurrenceCount >= 3 的 UserQuestionCard
 * - 对每张卡 originalText 提取 Top 4 双字词
 * - 若某张卡的关键词在 candidateTitle + candidateRationale 文本中命中 >= 2 个 → 视为匹配
 * - 命中后：projectFit = min(100, 原 projectFit + 15)，并附加 userQuestionBoost=true / matchedQuestionIds
 * - 未命中：不附加 userQuestionBoost 字段，保持原结构（避免污染旧数据）
 *
 * 此函数为纯函数，任何 Prisma / 解析错误都会原样返回 scoreBreakdown，绝不影响主流程。
 */
export async function applyUserQuestionBoost(
  scoreBreakdown: unknown,
  candidateTitle: string,
  candidateRationale: string,
  userId: string,
  prisma: PrismaClient,
): Promise<LooseScoreBreakdown> {
  const base: LooseScoreBreakdown = scoreBreakdown && typeof scoreBreakdown === "object"
    ? { ...(scoreBreakdown as Record<string, unknown>) }
    : {}

  try {
    const prismaAny = prisma as unknown as { userQuestionCard?: { findMany: (args: unknown) => Promise<unknown> } }
    if (!userId || !prisma || typeof prismaAny?.userQuestionCard?.findMany !== "function") {
      return base
    }
    const questionCards = await prismaAny.userQuestionCard.findMany({
      where: { userId, occurrenceCount: { gte: 3 } },
      select: { id: true, originalText: true },
    }) as Array<{ id: string; originalText: string }>

    if (!Array.isArray(questionCards) || questionCards.length === 0) {
      return base
    }

    const cardsWithKeywords = questionCards
      .filter((q) => q && typeof q.originalText === "string")
      .map((q) => ({
        id: q.id,
        keywords: extractKeywords(q.originalText, 4),
      }))
      .filter((q) => q.keywords.length >= 2)
    if (cardsWithKeywords.length === 0) {
      return base
    }

    const candidateText = String(candidateTitle ?? "") + "\n" + String(candidateRationale ?? "")
    const matchedIds: string[] = []
    for (const q of cardsWithKeywords) {
      let hitCount = 0
      for (const kw of q.keywords) {
        if (candidateText.includes(kw)) {
          hitCount++
          if (hitCount >= 2) break
        }
      }
      if (hitCount >= 2) matchedIds.push(q.id)
    }

    if (matchedIds.length === 0) {
      return base
    }
    const rawProjectFit = Number(base.projectFit)
    const currentProjectFit = Number.isFinite(rawProjectFit) ? rawProjectFit : 0
    const newProjectFit = Math.min(100, currentProjectFit + 15)
    return {
      ...base,
      projectFit: newProjectFit,
      userQuestionBoost: true,
      matchedQuestionIds: matchedIds,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn("[applyUserQuestionBoost] post-process skipped, fallback to original breakdown:", msg, { userId })
    return base
  }
}

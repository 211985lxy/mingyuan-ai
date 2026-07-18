/**
 * 效果→脚本反馈注入（数据飞轮 D5）。
 *
 * 查询历史表现最佳的文案（ContentOutcome 关联 AimGeneration/Script），
 * 按互动率/转化率排序，返回文案 + 效果特征，
 * 供 script-generator 的 buildContextBlock 注入。
 *
 * 原则：
 * - null 不当 0：views=null 的记录不参与排序。
 * - 最多返回 3 条（避免上下文膨胀）。
 * - 返回的文案截断前 500 字（足够提供风格参考，不喧宾夺主）。
 */

import type { PrismaClient } from "@/generated/prisma/client"

// ── 常量 ─────────────────────────────────────────────────

const TOP_PERFORMER_LIMIT = 3
const COPY_EXCERPT_MAX_CHARS = 500

/** 互动率门槛：至少 1% 才有参考价值。 */
const MIN_ENGAGEMENT_RATE = 0.01

// ── 类型 ─────────────────────────────────────────────────

export interface TopPerformer {
  generationId: string
  /** 文案原文（截断）。 */
  copyExcerpt: string
  /** 选题标题。 */
  topicTitle: string | null
  /** 平台。 */
  platform: string | null
  /** 效果快照。 */
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  /** 商业结果。 */
  qualifiedLeadCount: number | null
  dealCount: number | null
  revenue: number | null
  /** 互动率。 */
  engagementRate: number
  /** 转化率（仅 views>0 时有效）。 */
  conversionRate: number | null
  /** 用户判断。 */
  userVerdict: string | null
}

export interface OutcomeHistoryStore {
  contentOutcome: {
    findMany(args: {
      where: Record<string, unknown>
      orderBy?: Record<string, string>
      take?: number
      include?: Record<string, boolean>
    }): Promise<OutcomeWithGenerationRow[]>
  }
}

interface OutcomeWithGenerationRow {
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
}

// ── 核心逻辑 ──────────────────────────────────────────────

/**
 * 互动率 = (likes + comments + saves + shares) / max(views, 1)
 */
function computeEngagementRate(outcome: {
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
}): number {
  if (!outcome.views || outcome.views <= 0) return 0
  const interactions =
    (outcome.likes ?? 0) +
    (outcome.comments ?? 0) +
    (outcome.saves ?? 0) +
    (outcome.shares ?? 0)
  return interactions / outcome.views
}

/**
 * 转化率 = qualifiedLeadCount / max(views, 1)
 */
function computeConversionRate(outcome: {
  views: number | null
  qualifiedLeadCount: number | null
}): number | null {
  if (!outcome.views || outcome.views <= 0) return null
  return (outcome.qualifiedLeadCount ?? 0) / outcome.views
}

/**
 * 查询用户历史表现最佳的文案。
 *
 * 排序规则：
 *   1. 有 userVerdict 的优先
 *   2. 互动率降序
 *   3. 转化率降序
 *
 * @param input.userId 用户 ID
 * @param input.projectId 可选项目过滤
 * @param input.limit 返回数量（默认 3）
 * @param input.store 数据库抽象
 */
export async function getTopPerformingScripts(input: {
  userId: string
  projectId?: string | null
  limit?: number
  store: OutcomeHistoryStore
}): Promise<TopPerformer[]> {
  const limit = input.limit ?? TOP_PERFORMER_LIMIT

  // 查询该用户所有 ContentOutcome（含关联的 AimGeneration 文案）
  const where: Record<string, unknown> = {
    userId: input.userId,
  }
  if (input.projectId) {
    where.projectId = input.projectId
  }

  const rows = await input.store.contentOutcome.findMany({
    where,
    orderBy: { collectedAt: "desc" },
    take: 200, // 取近 200 条，内存排序
  })

  // 过滤 + 计算指标
  const candidates: TopPerformer[] = []
  for (const row of rows) {
    if (!row.generation) continue
    const rate = computeEngagementRate(row)
    if (rate < MIN_ENGAGEMENT_RATE && !row.userVerdict) continue

    const copy = row.generation.videoScript || row.generation.rawCopy
    if (!copy || copy.trim().length === 0) continue

    candidates.push({
      generationId: row.generationId,
      copyExcerpt: copy.slice(0, COPY_EXCERPT_MAX_CHARS),
      topicTitle: row.generation.topicTitle,
      platform: row.platform,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      saves: row.saves,
      shares: row.shares,
      qualifiedLeadCount: row.qualifiedLeadCount,
      dealCount: row.dealCount,
      revenue: row.revenue != null ? Number(row.revenue) : null,
      engagementRate: rate,
      conversionRate: computeConversionRate(row),
      userVerdict: row.userVerdict,
    })
  }

  // 排序：有 userVerdict 优先 → 互动率 → 转化率
  candidates.sort((a, b) => {
    if (a.userVerdict && !b.userVerdict) return -1
    if (!a.userVerdict && b.userVerdict) return 1
    if (b.engagementRate !== a.engagementRate) return b.engagementRate - a.engagementRate
    if (a.conversionRate != null && b.conversionRate != null) {
      return b.conversionRate - a.conversionRate
    }
    return 0
  })

  return candidates.slice(0, limit)
}

/**
 * 把历史最佳文案拼接成 prompt section，供 buildContextBlock 注入。
 * 无数据时返回空字符串（不注入）。
 */
export function buildTopPerformerSection(performers: TopPerformer[]): string {
  if (performers.length === 0) return ""

  const lines: string[] = [
    "【历史最佳表现文案参考】",
    "以下是你过往表现最好的文案，学习其风格与结构，但不要直接复制：",
    "",
  ]

  for (let i = 0; i < performers.length; i++) {
    const p = performers[i]
    const metrics: string[] = []
    if (p.views != null) metrics.push(`播放 ${p.views}`)
    if (p.likes != null) metrics.push(`点赞 ${p.likes}`)
    if (p.comments != null) metrics.push(`评论 ${p.comments}`)
    if (p.qualifiedLeadCount != null) metrics.push(`线索 ${p.qualifiedLeadCount}`)
    if (p.dealCount != null) metrics.push(`成交 ${p.dealCount}`)
    metrics.push(`互动率 ${(p.engagementRate * 100).toFixed(1)}%`)
    if (p.conversionRate != null) metrics.push(`转化率 ${(p.conversionRate * 100).toFixed(2)}%`)

    lines.push(`--- 参考 ${i + 1}：${p.topicTitle || "（无标题）"} ---`)
    lines.push(`效果：${metrics.join(" | ")}`)
    if (p.userVerdict) lines.push(`用户评价：${p.userVerdict}`)
    lines.push("文案：")
    lines.push(p.copyExcerpt)
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * 工厂：从 PrismaClient 构造 OutcomeHistoryStore。
 */
export function createOutcomeHistoryStore(prisma: PrismaClient): OutcomeHistoryStore {
  return {
    contentOutcome: {
      findMany: (args) =>
        prisma.contentOutcome.findMany({
          where: (args as { where: Record<string, unknown> }).where as never,
          orderBy: args.orderBy as never,
          take: args.take,
          include: { generation: { select: { id: true, rawCopy: true, videoScript: true, topicTitle: true } } },
        }) as unknown as Promise<OutcomeWithGenerationRow[]>,
    },
  }
}

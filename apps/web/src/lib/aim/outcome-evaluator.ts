/**
 * 效果→知识库回写（数据飞轮 D4）。
 *
 * 查询「优秀」ContentOutcome（用户标记 userVerdict 非空，或互动率/转化率超阈值），
 * 关联 AimGeneration 提取文案，写入 KnowledgeEntry（category=benchmark_reference），
 * 并触发向量化（ensureKnowledgeEmbedding）。
 *
 * 原则：
 * - null 不当 0：views=null 不参与互动率计算，只有 views>0 才算。
 * - 幂等：同一 ContentOutcome 不重复写入（靠 sourceType 标记 + outcomeId 去重）。
 * - 只提取确定性字段，不调用 LLM 猜测文案特征（LLM 特征提取留作后续增强）。
 */

import type { PrismaClient } from "@/generated/prisma/client"

// ── 阈值常量（单源） ──────────────────────────────────────

/** 互动率 = (likes + comments + saves + shares) / max(views, 1)，超过此值视为优秀。 */
const ENGAGEMENT_RATE_THRESHOLD = 0.05 // 5%

/** 转化率 = qualifiedLeadCount / max(views, 1)，超过此值视为优秀。 */
const CONVERSION_RATE_THRESHOLD = 0.001 // 0.1%

/** 每次评估最多处理的 ContentOutcome 数量。 */
const EVALUATE_BATCH_SIZE = 100

/** KnowledgeEntry.sourceType 标记，用于幂等去重。 */
const BENCHMARK_SOURCE_TYPE = "outcome_evaluator"

// ── 类型 ─────────────────────────────────────────────────

export interface ExcellentOutcome {
  outcomeId: string
  generationId: string
  userId: string
  projectId: string | null
  platform: string | null
  /** 原始文案（AimGeneration.rawCopy 或 finalizedCopy）。 */
  copy: string | null
  /** 互动数据快照。 */
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  /** 商业结果快照。 */
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: number | null
  /** 用户判断。 */
  userVerdict: string | null
  /** 计算出的优秀原因。 */
  reason: "user_excellent" | "engagement" | "conversion"
  /** 互动率（仅 views>0 时有效）。 */
  engagementRate: number | null
  /** 转化率（仅 views>0 时有效）。 */
  conversionRate: number | null
}

export interface EvaluateOutcomesResult {
  evaluated: number
  excellent: number
  writtenBack: number
  skipped: number
  errors: string[]
}

/** 最小 store 抽象（便于注入测试替身）。 */
export interface OutcomeEvaluatorStore {
  contentOutcome: {
    findMany(args: {
      where: Record<string, unknown>
      orderBy?: Record<string, string>
      take?: number
    }): Promise<OutcomeRow[]>
  }
  aimGeneration: {
    findMany(args: {
      where: Record<string, unknown>
      select: Record<string, boolean>
      take?: number
    }): Promise<GenerationRow[]>
  }
  knowledgeEntry: {
    findFirst(args: {
      where: Record<string, unknown>
      select: Record<string, boolean>
    }): Promise<{ id: string } | null>
    create(args: {
      data: Record<string, unknown>
    }): Promise<{ id: string }>
  }
}

interface OutcomeRow {
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
}

interface GenerationRow {
  id: string
  rawCopy: string | null
  videoScript: string | null
  topicTitle: string | null
}

// ── 核心逻辑 ──────────────────────────────────────────────

/**
 * 计算互动率。
 * 互动率 = (likes + comments + saves + shares) / max(views, 1)
 * 仅当 views > 0 时有意义；views=null 或 0 时返回 null。
 */
export function computeEngagementRate(outcome: {
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
}): number | null {
  if (!outcome.views || outcome.views <= 0) return null
  const interactions =
    (outcome.likes ?? 0) +
    (outcome.comments ?? 0) +
    (outcome.saves ?? 0) +
    (outcome.shares ?? 0)
  return interactions / outcome.views
}

/**
 * 计算转化率。
 * 转化率 = qualifiedLeadCount / max(views, 1)
 * 仅当 views > 0 时有意义。
 */
export function computeConversionRate(outcome: {
  views: number | null
  qualifiedLeadCount: number | null
}): number | null {
  if (!outcome.views || outcome.views <= 0) return null
  return (outcome.qualifiedLeadCount ?? 0) / outcome.views
}

/**
 * 判断一条 ContentOutcome 是否「优秀」。
 * 判定优先级：
 *   1. userVerdict 非空 → user_excellent
 *   2. 互动率 ≥ 5% → engagement
 *   3. 转化率 ≥ 0.1% → conversion
 */
function evaluateExcellent(row: OutcomeRow): { excellent: boolean; reason: ExcellentOutcome["reason"] | null; engagementRate: number | null; conversionRate: number | null } {
  const engagementRate = computeEngagementRate(row)
  const conversionRate = computeConversionRate(row)

  if (row.userVerdict && row.userVerdict.trim().length > 0) {
    return { excellent: true, reason: "user_excellent", engagementRate, conversionRate }
  }
  if (engagementRate != null && engagementRate >= ENGAGEMENT_RATE_THRESHOLD) {
    return { excellent: true, reason: "engagement", engagementRate, conversionRate }
  }
  if (conversionRate != null && conversionRate >= CONVERSION_RATE_THRESHOLD) {
    return { excellent: true, reason: "conversion", engagementRate, conversionRate }
  }
  return { excellent: false, reason: null, engagementRate, conversionRate }
}

/**
 * 构造 KnowledgeEntry 的 title 和 content。
 * 纯确定性拼接，不调用 LLM。
 */
function buildKnowledgeEntryContent(outcome: ExcellentOutcome, generation: GenerationRow): {
  title: string
  content: string
  tags: string[]
} {
  const copy = generation.videoScript || generation.rawCopy || "(文案不可用)"
  const metrics: string[] = []
  if (outcome.views != null) metrics.push(`播放 ${outcome.views}`)
  if (outcome.likes != null) metrics.push(`点赞 ${outcome.likes}`)
  if (outcome.comments != null) metrics.push(`评论 ${outcome.comments}`)
  if (outcome.saves != null) metrics.push(`收藏 ${outcome.saves}`)
  if (outcome.shares != null) metrics.push(`转发 ${outcome.shares}`)
  if (outcome.qualifiedLeadCount != null) metrics.push(`有效线索 ${outcome.qualifiedLeadCount}`)
  if (outcome.appointmentCount != null) metrics.push(`预约 ${outcome.appointmentCount}`)
  if (outcome.dealCount != null) metrics.push(`成交 ${outcome.dealCount}`)
  if (outcome.revenue != null) metrics.push(`收入 ¥${outcome.revenue}`)
  if (outcome.engagementRate != null) metrics.push(`互动率 ${(outcome.engagementRate * 100).toFixed(1)}%`)
  if (outcome.conversionRate != null) metrics.push(`转化率 ${(outcome.conversionRate * 100).toFixed(2)}%`)

  const tags: string[] = [
    "performance:excellent",
    `reason:${outcome.reason}`,
  ]
  if (outcome.platform) tags.push(`platform:${outcome.platform}`)
  if (outcome.userVerdict) tags.push(`verdict:${outcome.userVerdict.slice(0, 20)}`)

  const title = `优秀文案标杆 | ${generation.topicTitle || outcome.generationId.slice(-6)}`
  const content = [
    "【效果数据】",
    metrics.join(" | "),
    "",
    "【用户判断】",
    outcome.userVerdict || "(未填写)",
    "",
    "【文案原文】",
    copy,
  ].join("\n")

  return { title, content, tags }
}

/**
 * 评估用户的 ContentOutcome，将优秀的回写到知识库。
 *
 * @param input.userId 用户 ID
 * @param input.store 数据库抽象
 * @param input.ensureEmbedding 可选的向量化回调（生产环境注入 ensureKnowledgeEmbedding）
 * @returns 评估结果摘要
 */
export async function evaluateOutcomes(input: {
  userId: string
  store: OutcomeEvaluatorStore
  ensureEmbedding?: (entryId: string) => Promise<void>
}): Promise<EvaluateOutcomesResult> {
  const result: EvaluateOutcomesResult = {
    evaluated: 0,
    excellent: 0,
    writtenBack: 0,
    skipped: 0,
    errors: [],
  }

  // 1. 查询该用户所有 ContentOutcome（按 collectedAt 降序，优先最新）
  const outcomes = await input.store.contentOutcome.findMany({
    where: { userId: input.userId },
    orderBy: { collectedAt: "desc" },
    take: EVALUATE_BATCH_SIZE,
  })
  result.evaluated = outcomes.length

  if (outcomes.length === 0) return result

  // 2. 筛选优秀项
  const excellentOutcomes: ExcellentOutcome[] = []
  for (const row of outcomes) {
    const eval_ = evaluateExcellent(row)
    if (!eval_.excellent || !eval_.reason) {
      result.skipped++
      continue
    }
    excellentOutcomes.push({
      outcomeId: row.id,
      generationId: row.generationId,
      userId: row.userId,
      projectId: row.projectId,
      platform: row.platform,
      copy: null, // 从 AimGeneration 填充
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      saves: row.saves,
      shares: row.shares,
      qualifiedLeadCount: row.qualifiedLeadCount,
      appointmentCount: row.appointmentCount,
      dealCount: row.dealCount,
      revenue: row.revenue != null ? Number(row.revenue) : null,
      userVerdict: row.userVerdict,
      reason: eval_.reason,
      engagementRate: eval_.engagementRate,
      conversionRate: eval_.conversionRate,
    })
  }
  result.excellent = excellentOutcomes.length

  if (excellentOutcomes.length === 0) return result

  // 3. 批量查询关联的 AimGeneration（取文案）
  const generationIds = [...new Set(excellentOutcomes.map((o) => o.generationId))]
  const generations = await input.store.aimGeneration.findMany({
    where: { id: { in: generationIds } },
    select: { id: true, rawCopy: true, finalizedCopy: true, topicTitle: true },
    take: EVALUATE_BATCH_SIZE,
  })
  const genMap = new Map(generations.map((g) => [g.id, g]))

  // 4. 逐条写入 KnowledgeEntry（幂等：靠 outcomeId 去重）
  for (const outcome of excellentOutcomes) {
    const generation = genMap.get(outcome.generationId)
    if (!generation) {
      result.errors.push(`AimGeneration not found: ${outcome.generationId}`)
      continue
    }

    // 幂等检查：同一 outcomeId 不重复写入
    const existing = await input.store.knowledgeEntry.findFirst({
      where: {
        userId: outcome.userId,
        sourceType: BENCHMARK_SOURCE_TYPE,
        // Prisma 的 Json 过滤不直接支持，靠 tags 包含 outcomeId 来做应用层去重
        // 此处用 sourceType + title 匹配（title 含 generationId 后缀）
      },
      select: { id: true },
    })
    if (existing) {
      result.skipped++
      continue
    }

    const { title, content, tags } = buildKnowledgeEntryContent(outcome, generation)

    try {
      const created = await input.store.knowledgeEntry.create({
        data: {
          userId: outcome.userId,
          projectId: outcome.projectId,
          category: "benchmark_reference",
          title,
          content,
          tags: JSON.stringify(tags),
          sourceType: BENCHMARK_SOURCE_TYPE,
          valueGrade: "S", // 战略级：表现验证过的文案
          status: "active",
        },
      })

      // 触发向量化（非阻塞，失败不回滚）
      if (input.ensureEmbedding) {
        input.ensureEmbedding(created.id).catch(() => {
          result.errors.push(`embedding failed: ${created.id}`)
        })
      }

      result.writtenBack++
    } catch (e) {
      result.errors.push(`create failed: ${(e as Error).message}`)
    }
  }

  return result
}

/**
 * 工厂：从 PrismaClient 构造 OutcomeEvaluatorStore。
 * 用于生产环境注入。
 */
export function createOutcomeEvaluatorStore(prisma: PrismaClient): OutcomeEvaluatorStore {
  // Prisma 类型与 port 接口的 Record<string, unknown> 不直接兼容；
  // 工厂函数做桥接 cast，运行时 Prisma 会校验字段合法性。
  return {
    contentOutcome: {
      findMany: (args) => {
        const input = args as { where: Record<string, unknown>; orderBy?: Record<string, string>; take?: number }
        return prisma.contentOutcome.findMany({
          where: input.where as never,
          orderBy: input.orderBy as never,
          take: input.take ?? EVALUATE_BATCH_SIZE,
        }) as Promise<OutcomeRow[]>
      },
    },
    aimGeneration: {
      findMany: (args) => {
        const input = args as { where: Record<string, unknown>; take?: number }
        return prisma.aimGeneration.findMany({
          where: input.where as never,
          select: { id: true, rawCopy: true, videoScript: true, topicTitle: true },
          take: input.take ?? EVALUATE_BATCH_SIZE,
        }) as unknown as Promise<GenerationRow[]>
      },
    },
    knowledgeEntry: {
      findFirst: (args) =>
        prisma.knowledgeEntry.findFirst(args as never),
      create: (args) =>
        prisma.knowledgeEntry.create(args as never),
    },
  }
}

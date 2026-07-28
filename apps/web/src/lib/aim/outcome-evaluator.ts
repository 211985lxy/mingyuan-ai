/**
 * 效果→资产候选（数据飞轮 D4，阶段 4 收口）。
 *
 * 查询「优秀」ContentOutcome，生成 AssetCandidate（pending），
 * **不直接写入正式 KnowledgeEntry**；须人工 approve + promote。
 *
 * 原则：
 * - null 不当 0：views=null 不参与互动率计算，只有 views>0 才算。
 * - 幂等：同一 outcomeId+kind 不重复创建候选。
 * - 无 projectId 的结果跳过（AssetCandidate 要求项目归属）。
 */

import type { PrismaClient } from "@/generated/prisma/client"
import { buildAssetCandidatesFromOutcome } from "@/lib/aim/outcome-asset-candidates"
import { isNegativeOutcomeVerdict, isPositiveOutcomeVerdict, resolveOutcomeVerdictCode } from "@/lib/aim/outcome-verdict"

// ── 阈值常量（单源） ──────────────────────────────────────

/** 互动率 = (likes + comments + saves + shares) / max(views, 1)，超过此值视为优秀。 */
const ENGAGEMENT_RATE_THRESHOLD = 0.05 // 5%

/** 转化率 = qualifiedLeadCount / max(views, 1)，超过此值视为优秀。 */
const CONVERSION_RATE_THRESHOLD = 0.001 // 0.1%

/** 每次评估最多处理的 ContentOutcome 数量。 */
const EVALUATE_BATCH_SIZE = 100

const CANDIDATE_EVIDENCE_PREFIX = "outcomeId="

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
  /** 用户备注（自由文本）。 */
  userVerdict: string | null
  /** 结构化判断码；缺省为 unknown。 */
  verdictCode: string | null
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
  /** 已写入待确认资产候选数 */
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
  assetCandidate: {
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
  verdictCode: string | null
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
/**
 * @description 计算engagementrate
 * @param outcome - outcome
 * @returns number | null
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
/**
 * @description 计算conversionrate
 * @param outcome - outcome
 * @returns number | null
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
 *   1. verdictCode 为 excellent/effective → user_excellent（自由文本备注不参与）
 *   2. 互动率 ≥ 5% → engagement
 *   3. 转化率 ≥ 0.1% → conversion
 * 历史无码记录视为 unknown，不得因非空备注自动升级为优秀。
 */
function evaluateExcellent(row: OutcomeRow): { excellent: boolean; reason: ExcellentOutcome["reason"] | null; engagementRate: number | null; conversionRate: number | null } {
  const engagementRate = computeEngagementRate(row)
  const conversionRate = computeConversionRate(row)
  const code = resolveOutcomeVerdictCode(row.verdictCode)

  if (isPositiveOutcomeVerdict(code)) {
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
 * 评估用户的 ContentOutcome，将优秀的写入待确认资产候选。
 *
 * @param input.userId 用户 ID
 * @param input.store 数据库抽象
 * @param input.ensureEmbedding 可选的向量化回调（生产环境注入 ensureKnowledgeEmbedding）
 * @returns 评估结果摘要
 */
/**
 * @description 评估outcomes
 * @param input - 输入数据
 * @returns Promise<EvaluateOutcomesResult>
 */
export async function evaluateOutcomes(input: {
  userId: string
  store: OutcomeEvaluatorStore
  /** @deprecated 候选路径不再直写知识库，保留参数兼容旧调用 */
  ensureEmbedding?: (entryId: string) => Promise<void>
}): Promise<EvaluateOutcomesResult> {
  const result: EvaluateOutcomesResult = {
    evaluated: 0,
    excellent: 0,
    writtenBack: 0,
    skipped: 0,
    errors: [],
  }

  const outcomes = await input.store.contentOutcome.findMany({
    where: { userId: input.userId },
    orderBy: { collectedAt: "desc" },
    take: EVALUATE_BATCH_SIZE,
  })
  result.evaluated = outcomes.length

  if (outcomes.length === 0) return result

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
      copy: null,
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
      verdictCode: row.verdictCode,
      reason: eval_.reason,
      engagementRate: eval_.engagementRate,
      conversionRate: eval_.conversionRate,
    })
  }
  result.excellent = excellentOutcomes.length

  const negativeOutcomes: ExcellentOutcome[] = []
  for (const row of outcomes) {
    const code = resolveOutcomeVerdictCode(row.verdictCode)
    if (!isNegativeOutcomeVerdict(code)) continue
    if (excellentOutcomes.some((item) => item.outcomeId === row.id)) continue
    negativeOutcomes.push({
      outcomeId: row.id,
      generationId: row.generationId,
      userId: row.userId,
      projectId: row.projectId,
      platform: row.platform,
      copy: null,
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
      verdictCode: row.verdictCode,
      reason: "user_excellent",
      engagementRate: computeEngagementRate(row),
      conversionRate: computeConversionRate(row),
    })
  }

  const candidateSources = [...excellentOutcomes, ...negativeOutcomes]
  if (candidateSources.length === 0) return result

  const generationIds = [...new Set(candidateSources.map((o) => o.generationId))]
  const generations = await input.store.aimGeneration.findMany({
    where: { id: { in: generationIds } },
    select: { id: true, rawCopy: true, videoScript: true, topicTitle: true },
    take: EVALUATE_BATCH_SIZE,
  })
  const genMap = new Map(generations.map((g) => [g.id, g]))

  for (const outcome of candidateSources) {
    if (!outcome.projectId) {
      result.errors.push(`skip outcome without projectId: ${outcome.outcomeId}`)
      result.skipped++
      continue
    }

    const generation = genMap.get(outcome.generationId)
    if (!generation) {
      result.errors.push(`AimGeneration not found: ${outcome.generationId}`)
      continue
    }

    const copy = generation.rawCopy || generation.videoScript || null
    const drafts = buildAssetCandidatesFromOutcome({
      outcomeId: outcome.outcomeId,
      generationId: outcome.generationId,
      projectId: outcome.projectId,
      platform: outcome.platform,
      copy,
      topicTitle: generation.topicTitle,
      qualifiedLeadCount: outcome.qualifiedLeadCount,
      appointmentCount: outcome.appointmentCount,
      dealCount: outcome.dealCount,
      revenue: outcome.revenue,
      userVerdict: outcome.userVerdict,
      verdictCode: outcome.verdictCode,
      reason: outcome.reason,
    })

    if (drafts.length === 0) {
      result.skipped++
      continue
    }

    for (const draft of drafts) {
      const evidence = draft.evidence || `${CANDIDATE_EVIDENCE_PREFIX}${outcome.outcomeId}`
      const existing = await input.store.assetCandidate.findFirst({
        where: {
          userId: outcome.userId,
          generationId: outcome.generationId,
          kind: draft.kind,
          evidence,
        },
        select: { id: true },
      })
      if (existing) {
        result.skipped++
        continue
      }

      try {
        await input.store.assetCandidate.create({
          data: {
            userId: outcome.userId,
            projectId: outcome.projectId,
            generationId: outcome.generationId,
            kind: draft.kind,
            title: draft.title.slice(0, 200),
            content: draft.content,
            evidence,
            confidence: draft.confidence,
            reviewStatus: "pending",
            crossProjectAllowed: false,
          },
        })
        result.writtenBack++
      } catch (e) {
        result.errors.push(`create candidate failed: ${(e as Error).message}`)
      }
    }
  }

  return result
}

/**
 * 工厂：从 PrismaClient 构造 OutcomeEvaluatorStore。
 * 用于生产环境注入。
 */
/**
 * @description 创建outcomeevaluatorstore
 * @param prisma - Prisma 客户端
 * @returns OutcomeEvaluatorStore
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
    assetCandidate: {
      findFirst: (args) =>
        prisma.assetCandidate.findFirst(args as never),
      create: (args) =>
        prisma.assetCandidate.create(args as never),
    },
  }
}

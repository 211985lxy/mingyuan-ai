import { prisma } from "@/lib/prisma"
import {
  ATTRIBUTION_METHOD_LABELS,
  normalizeAttributionMethod,
} from "@/lib/aim/outcome-attribution"
import {
  OUTCOME_VERDICT_CODE_LABELS,
  resolveOutcomeVerdictCode,
} from "@/lib/aim/outcome-verdict"

type OutcomeMetric = number | { toString(): string } | null

export interface SanitizedOutcomeLike {
  collectWindowDay: number
  platform: string | null
  publishedAt: Date | string | null
  qualifiedCommentCount: number | null
  dmCount: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: OutcomeMetric
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  audienceFeedback: string | null
  userVerdict: string | null
  verdictNote: string | null
  verdictCode: string | null
}

export interface RetroSnapshotLike {
  summary?: string
  actualData?: string
  verdict?: string
  nextRule?: string
  createdAt?: string
}

/** 线索归因记录的只读投影（WP-D：复盘必须看见这条内容带来的可追溯线索）。 */
export interface AttributionRecordLike {
  externalLeadId: string
  externalDealId: string | null
  externalPaymentId: string | null
  attributionMethod: string
  occurredAt: Date
}

export interface PublishOutcomeContext {
  hasData: boolean
  block: string
}

const WINDOWS = [7, 14, 30] as const
const EMPTY_BLOCK = "未登记发布数据。暂时没有可用于复盘的真实数据。"

function displayValue(value: number | string | null): string {
  return value === null || value === "" ? "未填写" : String(value)
}

function displayMetric(value: OutcomeMetric): string {
  return value === null ? "未填写" : value.toString()
}

function displayDate(value: Date | string | null): string {
  if (value === null) return "未填写"
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "未填写" : date.toISOString().slice(0, 10)
}

function formatOutcome(outcome: SanitizedOutcomeLike): string[] {
  const verdict = OUTCOME_VERDICT_CODE_LABELS[resolveOutcomeVerdictCode(outcome.verdictCode)]
  return [
    `${outcome.collectWindowDay} 天窗口`,
    `平台：${displayValue(outcome.platform)}｜发布时间：${displayDate(outcome.publishedAt)}`,
    `内容信号：播放 ${displayValue(outcome.views)} 次｜点赞 ${displayValue(outcome.likes)} 次｜评论 ${displayValue(outcome.comments)} 条｜收藏 ${displayValue(outcome.saves)} 次｜分享 ${displayValue(outcome.shares)} 次`,
    `商业结果：有效评论 ${displayValue(outcome.qualifiedCommentCount)} 条｜私信 ${displayValue(outcome.dmCount)} 个｜有效线索 ${displayValue(outcome.qualifiedLeadCount)} 条｜预约 ${displayValue(outcome.appointmentCount)} 个｜成交 ${displayValue(outcome.dealCount)} 单｜营收 ${displayMetric(outcome.revenue)} 元`,
    `观众反馈：${displayValue(outcome.audienceFeedback)}`,
    `判定：${verdict}｜备注：${displayValue(outcome.verdictNote ?? outcome.userVerdict)}`,
  ]
}

function formatRetroSnapshots(snapshots: RetroSnapshotLike[]): string[] {
  if (snapshots.length === 0) return []
  const lines = ["", "已有复盘："]
  for (const snapshot of snapshots) {
    lines.push(
      `结论：${displayValue(snapshot.summary ?? null)}`,
      `实际数据：${displayValue(snapshot.actualData ?? null)}`,
      `判断：${displayValue(snapshot.verdict ?? null)}`,
      `下次规则：${displayValue(snapshot.nextRule ?? null)}`,
    )
  }
  return lines
}

function formatAttributions(attributions: AttributionRecordLike[]): string[] {
  if (attributions.length === 0) {
    return [
      "线索归因：未登记（这条内容还没有挂任何可追溯线索；如私域有加微/进线，请回内容卡片登记）",
    ]
  }
  const lines = [`线索归因：共 ${attributions.length} 条登记`]
  for (const record of attributions) {
    const method = ATTRIBUTION_METHOD_LABELS[normalizeAttributionMethod(record.attributionMethod)]
    const dealBound = record.externalDealId || record.externalPaymentId ? "已挂成交/回款" : "未挂成交"
    lines.push(
      `- 线索「${record.externalLeadId}」｜${method}｜${dealBound}｜登记 ${displayDate(record.occurredAt)}`,
    )
  }
  return lines
}

export function formatPublishOutcomeBlock(input: {
  outcomes: SanitizedOutcomeLike[]
  retroSnapshots: RetroSnapshotLike[]
  attributions?: AttributionRecordLike[]
}): PublishOutcomeContext {
  const attributions = input.attributions ?? []
  if (input.outcomes.length === 0 && input.retroSnapshots.length === 0 && attributions.length === 0) {
    return { hasData: false, block: EMPTY_BLOCK }
  }

  const lines = ["发布结果数据："]
  for (const windowDay of WINDOWS) {
    const outcome = input.outcomes.find((item) => item.collectWindowDay === windowDay)
    lines.push(...(outcome ? formatOutcome(outcome) : [`${windowDay} 天窗口：未登记`]), "")
  }
  lines.push(...formatRetroSnapshots(input.retroSnapshots))
  lines.push(...formatAttributions(attributions))
  return { hasData: true, block: lines.join("\n").trim() }
}

export async function loadPublishOutcomeContext(input: {
  generationId: string
  userId: string
}): Promise<PublishOutcomeContext> {
  const [generation, attributions] = await Promise.all([
    prisma.aimGeneration.findFirst({
      where: { id: input.generationId, userId: input.userId },
      select: {
        retroSnapshots: true,
        contentOutcomes: {
          where: { userId: input.userId },
          orderBy: { collectWindowDay: "asc" },
          take: 3,
        },
      },
    }),
    prisma.outcomeAttribution.findMany({
      where: { generationId: input.generationId, userId: input.userId },
      orderBy: { occurredAt: "asc" },
      take: 50,
    }),
  ])
  if (!generation) return { hasData: false, block: EMPTY_BLOCK }

  const rawSnapshots = Array.isArray(generation.retroSnapshots)
    ? (generation.retroSnapshots as unknown[])
    : []
  const retroSnapshots = rawSnapshots.filter(
    (snapshot): snapshot is RetroSnapshotLike =>
      typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot),
  )

  return formatPublishOutcomeBlock({
    outcomes: generation.contentOutcomes,
    retroSnapshots,
    attributions,
  })
}

/**
 * 只有执行引擎是数据复盘、且请求里有明确的目标内容 id 时才读库。
 * 拿不到 id 绝不猜最近一条——选错内容比没有复盘更糟。
 */
export function shouldLoadPublishOutcomeContext(
  executionAgentId: string,
  generationId: string | null | undefined,
): boolean {
  return executionAgentId === "content_retro" && Boolean(generationId?.trim())
}

/**
 * chat 装配用：按需读发布数据。不满足门闩时直接 undefined（不碰库）；
 * 读到但无有效登记时也返回 undefined，让提示词走「未登记」分支。
 * 读库失败不在此吞掉，由上层暴露可行动错误。
 */
export async function resolvePublishOutcomeBlock(input: {
  executionAgentId: string
  userId: string
  generationId?: string | null
}): Promise<string | undefined> {
  const generationId = input.generationId?.trim() ?? ""
  if (!shouldLoadPublishOutcomeContext(input.executionAgentId, generationId)) {
    return undefined
  }
  const outcome = await loadPublishOutcomeContext({
    generationId,
    userId: input.userId,
  })
  return outcome.hasData ? outcome.block : undefined
}

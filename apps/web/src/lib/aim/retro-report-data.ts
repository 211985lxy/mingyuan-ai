/**
 * HTML 复盘报告数据装配：从数据库加载单条内容的复盘数据（真源）。
 * 与渲染解耦：本模块只负责查询、归属校验与行映射，不产 HTML。
 */

import type {
  RetroReportAttributionRow,
  RetroReportData,
  RetroReportOutcomeRow,
  RetroReportSnapshotRow,
} from "@/lib/aim/retro-report-html"

export interface RetroReportDbPort {
  aimGeneration: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>
  }
  contentOutcome: {
    findMany(args: unknown): Promise<Array<Record<string, unknown>>>
  }
  outcomeAttribution: {
    findMany(args: unknown): Promise<Array<Record<string, unknown>>>
  }
}

export function parseRetroSnapshots(value: unknown): RetroReportSnapshotRow[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      summary: typeof item.summary === "string" ? item.summary : "",
      actualData: typeof item.actualData === "string" ? item.actualData : undefined,
      verdict: typeof item.verdict === "string" ? item.verdict : undefined,
      nextRule: typeof item.nextRule === "string" ? item.nextRule : undefined,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    }))
    .filter((item) => item.summary.trim().length > 0)
}

function toDate(value: unknown): Date | null {
  return value instanceof Date ? value : null
}

function toNumberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value)
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function mapOutcomeRow(row: Record<string, unknown>): RetroReportOutcomeRow {
  return {
    collectWindowDay: Number(row.collectWindowDay),
    collectedAt: toDate(row.collectedAt) ?? new Date(0),
    platform: toStringOrNull(row.platform),
    views: toNumberOrNull(row.views),
    likes: toNumberOrNull(row.likes),
    comments: toNumberOrNull(row.comments),
    saves: toNumberOrNull(row.saves),
    shares: toNumberOrNull(row.shares),
    qualifiedCommentCount: toNumberOrNull(row.qualifiedCommentCount),
    dmCount: toNumberOrNull(row.dmCount),
    qualifiedLeadCount: toNumberOrNull(row.qualifiedLeadCount),
    appointmentCount: toNumberOrNull(row.appointmentCount),
    dealCount: toNumberOrNull(row.dealCount),
    revenue: toNumberOrNull(row.revenue),
    verdictCode: toStringOrNull(row.verdictCode),
    verdictNote: toStringOrNull(row.verdictNote),
    audienceFeedback: toStringOrNull(row.audienceFeedback),
  }
}

function mapAttributionRow(row: Record<string, unknown>): RetroReportAttributionRow {
  return {
    externalLeadId: String(row.externalLeadId ?? ""),
    attributionMethod: String(row.attributionMethod ?? ""),
    externalDealId: toStringOrNull(row.externalDealId),
    externalPaymentId: toStringOrNull(row.externalPaymentId),
    occurredAt: toDate(row.occurredAt) ?? new Date(0),
  }
}

/** 归属校验失败返回 null；Decimal 营收转 number。 */
export async function loadRetroReportData(
  db: RetroReportDbPort,
  userId: string,
  generationId: string,
): Promise<RetroReportData | null> {
  const generation = await db.aimGeneration.findFirst({
    where: { id: generationId, userId },
    select: {
      id: true, topicTitle: true, rawInput: true, workflowStatus: true,
      publishPlatform: true, publishUrl: true, publishedAt: true, createdAt: true, retroSnapshots: true,
    },
  })
  if (!generation) return null

  const [outcomes, attributions] = await Promise.all([
    db.contentOutcome.findMany({
      where: { generationId, userId },
      orderBy: { collectWindowDay: "asc" },
      take: 3,
    }),
    db.outcomeAttribution.findMany({
      where: { generationId, userId },
      orderBy: { occurredAt: "asc" },
      take: 100,
    }),
  ])

  return {
    generation: {
      id: String(generation.id),
      topicTitle: toStringOrNull(generation.topicTitle),
      rawInput: toStringOrNull(generation.rawInput),
      workflowStatus: String(generation.workflowStatus ?? ""),
      publishPlatform: toStringOrNull(generation.publishPlatform),
      publishUrl: toStringOrNull(generation.publishUrl),
      publishedAt: toDate(generation.publishedAt),
      createdAt: toDate(generation.createdAt) ?? new Date(0),
    },
    outcomes: outcomes.map(mapOutcomeRow),
    attributions: attributions.map(mapAttributionRow),
    retroSnapshots: parseRetroSnapshots(generation.retroSnapshots),
    generatedAt: new Date(),
  }
}

/**
 * 月度经营报告聚合（WP-E · 归因数据资产化，对客户）。
 *
 * 回答「这个月的内容带来了什么」：发布数、内容信号、商业结果、线索归因、按内容任务聚合。
 * 纪律（与 WP-D 一致）：
 * - 空值≠0：未回填合计为 null，已知条数单独输出。
 * - 7/14/30 是累计快照：每条内容只取窗口内最成熟的一档（30>14>7），不相加。
 * - 样本不足只列事实不下结论；数据缺口显式列出，不隐藏。
 */

import { computeTaskAttributionInsights, type AttributionInsightsStorePort, type TaskAttributionInsight } from "@/lib/aim/attribution-insights"

export interface MonthlyReportOutcomeRow {
  generationId: string
  collectWindowDay: number
  collectedAt: Date
  views: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: number | null
}

export interface MonthlyReportAttributionRow {
  generationId: string
  attributionMethod: string
}

export interface MonthlyBusinessTotals {
  knownCount: number
  views: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: number | null
}

export interface MonthlyOperatingReport {
  month: string
  projectId: string | null
  publishedCount: number
  /** 有任一窗口 Outcome 回填的内容条数 */
  backfilledCount: number
  business: MonthlyBusinessTotals
  attribution: { traceableLeadCount: number; unknownLeadCount: number }
  taskInsights: TaskAttributionInsight[]
  dataNotes: string[]
}

const WINDOW_MATURITY = [30, 14, 7]

export function parseMonthString(value: string): { start: Date; end: Date; month: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { start, end, month: `${match[1]}-${match[2]}` }
}

/** 每条内容取窗口末（collectedAt < end）最成熟的一档快照；都没有返回 null。 */
export function pickMatureSnapshots(
  rows: MonthlyReportOutcomeRow[],
  end: Date,
): Map<string, MonthlyReportOutcomeRow> {
  const byGeneration = new Map<string, MonthlyReportOutcomeRow[]>()
  for (const row of rows) {
    if (row.collectedAt.getTime() >= end.getTime()) continue
    const bucket = byGeneration.get(row.generationId) ?? []
    bucket.push(row)
    byGeneration.set(row.generationId, bucket)
  }
  const picked = new Map<string, MonthlyReportOutcomeRow>()
  for (const [generationId, bucket] of byGeneration) {
    for (const window of WINDOW_MATURITY) {
      const row = bucket.find((item) => item.collectWindowDay === window)
      if (row) {
        picked.set(generationId, row)
        break
      }
    }
  }
  return picked
}

function sumNullable(values: Array<number | null>): { known: number; total: number | null } {
  const known = values.filter((value): value is number => value != null && Number.isFinite(value))
  return { known: known.length, total: known.length > 0 ? known.reduce((a, b) => a + b, 0) : null }
}

/** 跨内容合计：任一内容该指标有数即输出合计，全部未回填为 null。 */
function aggregateBusiness(snapshots: Map<string, MonthlyReportOutcomeRow>): MonthlyBusinessTotals {
  const rows = [...snapshots.values()]
  const views = sumNullable(rows.map((row) => row.views))
  const leads = sumNullable(rows.map((row) => row.qualifiedLeadCount))
  const appointments = sumNullable(rows.map((row) => row.appointmentCount))
  const deals = sumNullable(rows.map((row) => row.dealCount))
  const revenue = sumNullable(rows.map((row) => row.revenue))
  const knownCount = rows.filter((row) =>
    [row.views, row.qualifiedLeadCount, row.appointmentCount, row.dealCount, row.revenue].some(
      (value) => value != null,
    ),
  ).length
  return {
    knownCount,
    views: views.total,
    qualifiedLeadCount: leads.total,
    appointmentCount: appointments.total,
    dealCount: deals.total,
    revenue: revenue.total,
  }
}

/** 月报端口：在 WP-D 聚合端口之上扩展商业结果字段（方法双变，兼容其调用）。 */
export interface MonthlyReportStorePort extends AttributionInsightsStorePort {
  contentOutcome: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<MonthlyReportOutcomeRow[]>
  }
}

export async function computeMonthlyOperatingReport(input: {
  userId: string
  projectId?: string | null
  month: string
  store: MonthlyReportStorePort
}): Promise<MonthlyOperatingReport | null> {
  const window = parseMonthString(input.month)
  if (!window) return null
  const scope = {
    userId: input.userId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
  }

  const generations = (await input.store.aimGeneration.findMany({ where: scope, take: 1000 }))
    .filter((g) => g.workflowStatus === "published" && g.publishedAt != null
      && g.publishedAt.getTime() >= window.start.getTime()
      && g.publishedAt.getTime() < window.end.getTime())

  const [outcomes, attributions, taskInsights] = await Promise.all([
    input.store.contentOutcome.findMany({ where: scope, take: 5000 }),
    input.store.outcomeAttribution.findMany({ where: scope, take: 5000 }),
    computeTaskAttributionInsights({
      userId: input.userId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      start: window.start,
      end: window.end,
      store: input.store,
    }),
  ])

  const generationIds = new Set(generations.map((g) => g.id))
  const scopedOutcomes = outcomes.filter((row) => generationIds.has(row.generationId))
  const scopedAttributions = attributions.filter((row) => generationIds.has(row.generationId))

  const snapshots = pickMatureSnapshots(scopedOutcomes, window.end)
  const business = aggregateBusiness(snapshots)

  let traceableLeadCount = 0
  let unknownLeadCount = 0
  for (const row of scopedAttributions) {
    if (row.attributionMethod === "explicit" || row.attributionMethod === "first_touch") traceableLeadCount += 1
    else unknownLeadCount += 1
  }

  const dataNotes: string[] = []
  const noDataCount = generations.length - snapshots.size
  if (generations.length > 0 && noDataCount > 0) {
    dataNotes.push(`${noDataCount} 条已发布内容未回填任何数据窗口`)
  }
  if (business.knownCount > 0 && business.knownCount < generations.length) {
    dataNotes.push(`商业指标仅覆盖 ${business.knownCount}/${generations.length} 条内容，合计为已知部分`)
  }
  if (business.revenue != null && business.knownCount < generations.length) {
    dataNotes.push("营收合计基于部分内容，不代表全量")
  }
  if (generations.length > 0 && generations.length < 3) {
    dataNotes.push(`本月仅发布 ${generations.length} 条，样本不足，仅列事实不下结论`)
  }

  return {
    month: window.month,
    projectId: input.projectId ?? null,
    publishedCount: generations.length,
    backfilledCount: snapshots.size,
    business,
    attribution: { traceableLeadCount, unknownLeadCount },
    taskInsights,
    dataNotes,
  }
}

/**
 * 经营账本最小版（WP-2.1）。
 *
 * 只统一读路径，不写飞书、不改 ContentOutcome / OutcomeAttribution 正本。
 * 周报 / 月报 / 看板都从这里读六主指标，禁止再各自手算。
 *
 * 口径（null 不当 0；显式 0 算有效数据；7/14/30 累计快照取周期末最成熟窗口后再做期末-期初差）：
 * 1. 发布数：AimGeneration.workflowStatus=published 且 publishedAt ∈ [start, end)
 * 2. 可追溯线索：OutcomeAttribution.attributionMethod ∈ {explicit, first_touch} 且 occurredAt ∈ [start, end)；unknown 单列
 * 3. 预约：同期归因行带 externalAppointmentId
 * 4. 成交收入：成交笔数来自带 externalDealId 的归因行；金额来自 ContentOutcome.revenue 快照差（归因表无金额，不编造）
 * 5. 资产复用：周期内 generation.knowledgeUsed 引用次数，≥2 为复用
 * 6. 第 7 天回填率：publishedAt+7d ≤ end 的已发布内容中，day=7 窗口已有内容信号或商业字段
 *
 * 周报对外字段仍走 ContentOutcome 快照差（兼容现有看板），规范六指标在 canonical。
 */

import { normalizeAttributionMethod } from "@/lib/aim/outcome-attribution"

export interface WeeklyReviewMetrics {
  periodStart: string
  periodEnd: string
  publishedCount: number
  qualifiedLeadCount: number
  appointmentCount: number
  dealCount: number
  revenue: number
  referencedAssetCount: number
  reusedAssetCount: number
  day7Backfill: { due: number; filled: number }
}

export const WEEKLY_OUTCOME_WINDOW_POLICY = "cumulative_snapshot_delta_v1"

export interface CanonicalOperatingMetrics {
  publishedCount: number
  traceableLeadCount: number
  unknownLeadCount: number
  appointmentCount: number
  dealCount: number
  revenue: number
  referencedAssetCount: number
  reusedAssetCount: number
  day7Backfill: { due: number; filled: number }
}

export interface OperatingLedger {
  periodStart: string
  periodEnd: string
  source: "metric-layer"
  weekly: WeeklyReviewMetrics
  canonical: CanonicalOperatingMetrics
}

interface GenerationRow {
  id: string
  workflowStatus: string
  publishedAt: Date | null
  createdAt: Date
  knowledgeUsed: unknown
}

interface OutcomeRow {
  generationId: string
  collectWindowDay: number
  collectedAt: Date
  qualifiedCommentCount: number | null
  dmCount: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: unknown
  userVerdict: string | null
  views?: number | null
  likes?: number | null
  comments?: number | null
  saves?: number | null
  shares?: number | null
}

interface AttributionRow {
  generationId: string
  attributionMethod: string
  occurredAt?: Date
  externalAppointmentId?: string | null
  externalDealId?: string | null
}

export interface WeeklyReviewStorePort {
  aimGeneration: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<GenerationRow[]>
  }
  contentOutcome: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<OutcomeRow[]>
  }
  outcomeAttribution?: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<AttributionRow[]>
  }
}

export interface SnapshotKeyRow {
  generationId: string
  collectWindowDay: number
  collectedAt: Date
}

const DAY_MS = 24 * 3600 * 1000

function inRange(value: Date | null, start: Date, end: Date): value is Date {
  return value != null && value.getTime() >= start.getTime() && value.getTime() < end.getTime()
}

function hasAnyBusinessMetric(row: OutcomeRow): boolean {
  return [
    row.qualifiedCommentCount,
    row.dmCount,
    row.qualifiedLeadCount,
    row.appointmentCount,
    row.dealCount,
    row.revenue,
    row.userVerdict,
  ].some((value) => value != null && value !== "")
}

function hasContentSignal(row: OutcomeRow): boolean {
  return [row.views, row.likes, row.comments, row.saves, row.shares].some(
    (value) => value != null && Number.isFinite(value),
  )
}

function hasDay7WindowCoverage(row: OutcomeRow): boolean {
  return hasAnyBusinessMetric(row) || hasContentSignal(row)
}

function sumPeriodSnapshotDeltas(
  rows: OutcomeRow[],
  start: Date,
  end: Date,
  pick: (row: OutcomeRow) => number | null,
): number {
  const endSnapshots = pickPeriodEndSnapshots(
    rows.filter((row) => row.collectedAt.getTime() < end.getTime()),
  )
  const startSnapshots = new Map(
    pickPeriodEndSnapshots(
      rows.filter((row) => row.collectedAt.getTime() < start.getTime()),
    ).map((row) => [row.generationId, row]),
  )
  let total = 0
  for (const endRow of endSnapshots) {
    const endValue = pick(endRow)
    if (endValue == null || !Number.isFinite(endValue)) continue
    const startRow = startSnapshots.get(endRow.generationId)
    const startValue = startRow ? pick(startRow) : null
    total += startValue != null && Number.isFinite(startValue)
      ? endValue - startValue
      : endValue
  }
  return total
}

export function pickPeriodEndSnapshots<T extends SnapshotKeyRow>(rows: T[]): T[] {
  const best = new Map<string, T>()
  for (const row of rows) {
    const prev = best.get(row.generationId)
    if (!prev) {
      best.set(row.generationId, row)
      continue
    }
    if (row.collectWindowDay > prev.collectWindowDay) {
      best.set(row.generationId, row)
      continue
    }
    if (
      row.collectWindowDay === prev.collectWindowDay &&
      row.collectedAt.getTime() > prev.collectedAt.getTime()
    ) {
      best.set(row.generationId, row)
    }
  }
  return [...best.values()]
}

function extractKnowledgeIds(knowledgeUsed: unknown): string[] {
  if (!Array.isArray(knowledgeUsed)) return []
  const ids: string[] = []
  for (const item of knowledgeUsed) {
    if (typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string") {
      ids.push((item as { id: string }).id)
    }
  }
  return ids
}

function pickNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function countAttributions(
  rows: AttributionRow[],
  start: Date,
  end: Date,
): { traceableLeadCount: number; unknownLeadCount: number; appointmentCount: number; dealCount: number } {
  let traceableLeadCount = 0
  let unknownLeadCount = 0
  let appointmentCount = 0
  let dealCount = 0
  for (const row of rows) {
    if (row.occurredAt && !inRange(row.occurredAt, start, end)) continue
    const method = normalizeAttributionMethod(row.attributionMethod)
    if (method === "unknown") unknownLeadCount += 1
    else traceableLeadCount += 1
    if (row.externalAppointmentId?.trim()) appointmentCount += 1
    if (row.externalDealId?.trim()) dealCount += 1
  }
  return { traceableLeadCount, unknownLeadCount, appointmentCount, dealCount }
}

async function loadLedgerRows(input: {
  userId?: string
  projectId?: string
  generationIds?: string[]
  store: WeeklyReviewStorePort
}) {
  const where = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.generationIds ? { id: { in: input.generationIds } } : {}),
  }
  const outcomeWhere = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.generationIds ? { generationId: { in: input.generationIds } } : {}),
  }
  const [generations, outcomes, attributions] = await Promise.all([
    input.store.aimGeneration.findMany({ where, take: 1000 }),
    input.store.contentOutcome.findMany({ where: outcomeWhere, take: 5000 }),
    input.store.outcomeAttribution
      ? input.store.outcomeAttribution.findMany({ where: outcomeWhere, take: 5000 })
      : Promise.resolve([] as AttributionRow[]),
  ])
  return { generations, outcomes, attributions }
}

function assetReuse(generations: GenerationRow[], start: Date, end: Date) {
  const usage = new Map<string, number>()
  for (const generation of generations.filter((g) => inRange(g.createdAt, start, end))) {
    for (const id of extractKnowledgeIds(generation.knowledgeUsed)) {
      usage.set(id, (usage.get(id) ?? 0) + 1)
    }
  }
  let reusedAssetCount = 0
  for (const count of usage.values()) {
    if (count >= 2) reusedAssetCount += 1
  }
  return { referencedAssetCount: usage.size, reusedAssetCount }
}

function day7Coverage(generations: GenerationRow[], outcomes: OutcomeRow[], end: Date) {
  const dueGenerations = generations.filter(
    (g) =>
      g.workflowStatus === "published" &&
      g.publishedAt != null &&
      g.publishedAt.getTime() + 7 * DAY_MS <= end.getTime(),
  )
  const filled = dueGenerations.filter((g) =>
    outcomes.some(
      (o) => o.generationId === g.id && o.collectWindowDay === 7 && hasDay7WindowCoverage(o),
    ),
  ).length
  return { due: dueGenerations.length, filled }
}

export async function computeOperatingLedger(input: {
  userId?: string
  projectId?: string
  generationIds?: string[]
  start: Date
  end: Date
  store: WeeklyReviewStorePort
}): Promise<OperatingLedger> {
  const { start, end } = input
  const { generations, outcomes, attributions } = await loadLedgerRows(input)

  const publishedCount = generations.filter(
    (g) => g.workflowStatus === "published" && inRange(g.publishedAt, start, end),
  ).length

  const qualifiedLeadCount = sumPeriodSnapshotDeltas(
    outcomes, start, end, (o) => o.qualifiedLeadCount,
  )
  const snapshotAppointmentCount = sumPeriodSnapshotDeltas(
    outcomes, start, end, (o) => o.appointmentCount,
  )
  const snapshotDealCount = sumPeriodSnapshotDeltas(
    outcomes, start, end, (o) => o.dealCount,
  )
  const revenue = sumPeriodSnapshotDeltas(outcomes, start, end, (o) => pickNumber(o.revenue))
  const assets = assetReuse(generations, start, end)
  const day7Backfill = day7Coverage(generations, outcomes, end)
  const attributed = countAttributions(attributions, start, end)

  const weekly: WeeklyReviewMetrics = {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    publishedCount,
    qualifiedLeadCount,
    appointmentCount: snapshotAppointmentCount,
    dealCount: snapshotDealCount,
    revenue,
    referencedAssetCount: assets.referencedAssetCount,
    reusedAssetCount: assets.reusedAssetCount,
    day7Backfill,
  }

  return {
    periodStart: weekly.periodStart,
    periodEnd: weekly.periodEnd,
    source: "metric-layer",
    weekly,
    canonical: {
      publishedCount,
      traceableLeadCount: attributed.traceableLeadCount,
      unknownLeadCount: attributed.unknownLeadCount,
      appointmentCount: attributed.appointmentCount,
      dealCount: attributed.dealCount,
      revenue,
      referencedAssetCount: assets.referencedAssetCount,
      reusedAssetCount: assets.reusedAssetCount,
      day7Backfill,
    },
  }
}

export async function computeWeeklyReview(input: {
  userId?: string
  projectId?: string
  generationIds?: string[]
  start: Date
  end: Date
  store: WeeklyReviewStorePort
}): Promise<WeeklyReviewMetrics> {
  const ledger = await computeOperatingLedger(input)
  return ledger.weekly
}

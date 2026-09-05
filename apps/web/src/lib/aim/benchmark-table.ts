/**
 * 跨客户基准表 v0（WP-E · 对内）。
 *
 * 回答「哪类内容任务在哪些客户身上带来可追溯线索与成交」：
 * 按「内容任务 × 客户」聚合，再横滚成跨客户基准行。
 * 纪律：
 * - 单客户窗口内发布 <3 条不进表（不足以代表该客户）。
 * - 成交取每条内容窗口末最成熟快照（30>14>7），全未回填为 null（空值≠0）。
 * - 活跃客户 <5 时强制「样本不足，仅内部参考，禁止对外」。
 */

import { resolveContentTask } from "@/lib/aim/attribution-insights"
import { pickMatureSnapshots, type MonthlyReportOutcomeRow } from "@/lib/aim/monthly-report"

export interface BenchmarkGenerationRow {
  id: string
  userId: string
  workflowStatus: string
  publishedAt: Date | null
  taskSpec: unknown
}

export type BenchmarkOutcomeRow = MonthlyReportOutcomeRow

export interface BenchmarkAttributionRow {
  generationId: string
  attributionMethod: string
}

export interface BenchmarkTableStorePort {
  aimGeneration: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<BenchmarkGenerationRow[]>
  }
  contentOutcome: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<BenchmarkOutcomeRow[]>
  }
  outcomeAttribution: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<BenchmarkAttributionRow[]>
  }
}

export interface BenchmarkRow {
  contentTask: string
  customerCount: number
  publishedCount: number
  traceableLeadCount: number
  unknownLeadCount: number
  /** null = 该组内容全部未回填成交（空值≠0） */
  dealCount: number | null
  /** 可追溯线索 / 发布数；发布数为 0 时 null */
  leadRate: number | null
  dealRate: number | null
  sampleNote: string | null
}

export interface CrossCustomerBenchmark {
  windowDays: number
  /** 窗口内至少发布 1 条的客户数（无论是否进表） */
  activeCustomerCount: number
  rows: BenchmarkRow[]
  disclaimer: string
}

const MIN_PUBLISHED_PER_CUSTOMER = 3
const MIN_ACTIVE_CUSTOMERS = 5
const UNSPECIFIED_TASK = "未标注"

function rate(numerator: number | null, denominator: number): number | null {
  if (numerator == null || denominator <= 0) return null
  return Math.round((numerator / denominator) * 10000) / 10000
}

interface BenchmarkGroupTotal {
  customerCount: number
  publishedCount: number
  traceable: number
  unknown: number
  dealKnown: number
  dealSum: number
}

/** 客户 × 内容任务 → 跨客户横滚；不足 3 条发布的客户整体不进表。 */
function aggregateCustomerTasks(input: {
  generations: BenchmarkGenerationRow[]
  matureSnapshots: Map<string, MonthlyReportOutcomeRow>
  leadsByGeneration: Map<string, { traceable: number; unknown: number }>
}): Map<string, BenchmarkGroupTotal> {
  const byCustomer = new Map<string, BenchmarkGenerationRow[]>()
  for (const generation of input.generations) {
    const bucket = byCustomer.get(generation.userId) ?? []
    bucket.push(generation)
    byCustomer.set(generation.userId, bucket)
  }

  const grouped = new Map<string, BenchmarkGroupTotal>()
  for (const rows of byCustomer.values()) {
    if (rows.length < MIN_PUBLISHED_PER_CUSTOMER) continue
    const taskBuckets = new Map<string, Omit<BenchmarkGroupTotal, "customerCount">>()
    for (const generation of rows) {
      const task = resolveContentTask(generation.taskSpec)
      const bucket = taskBuckets.get(task) ?? { publishedCount: 0, traceable: 0, unknown: 0, dealKnown: 0, dealSum: 0 }
      bucket.publishedCount += 1
      const leads = input.leadsByGeneration.get(generation.id)
      bucket.traceable += leads?.traceable ?? 0
      bucket.unknown += leads?.unknown ?? 0
      const deal = input.matureSnapshots.get(generation.id)?.dealCount
      if (deal != null && Number.isFinite(deal)) {
        bucket.dealKnown += 1
        bucket.dealSum += deal
      }
      taskBuckets.set(task, bucket)
    }
    for (const [task, bucket] of taskBuckets) {
      const total = grouped.get(task)
        ?? { customerCount: 0, publishedCount: 0, traceable: 0, unknown: 0, dealKnown: 0, dealSum: 0 }
      total.customerCount += 1
      total.publishedCount += bucket.publishedCount
      total.traceable += bucket.traceable
      total.unknown += bucket.unknown
      total.dealKnown += bucket.dealKnown
      total.dealSum += bucket.dealSum
      grouped.set(task, total)
    }
  }
  return grouped
}

export async function computeCrossCustomerBenchmark(input: {
  start: Date
  end: Date
  windowDays: number
  store: BenchmarkTableStorePort
}): Promise<CrossCustomerBenchmark> {
  const generations = (await input.store.aimGeneration.findMany({ take: 5000 }))
    .filter((row) => row.workflowStatus === "published" && row.publishedAt != null
      && row.publishedAt.getTime() >= input.start.getTime()
      && row.publishedAt.getTime() < input.end.getTime())

  const activeCustomerCount = new Set(generations.map((row) => row.userId)).size
  if (generations.length === 0) {
    return { windowDays: input.windowDays, activeCustomerCount: 0, rows: [], disclaimer: buildDisclaimer(0) }
  }

  const generationIds = new Set(generations.map((row) => row.id))
  const [outcomes, attributions] = await Promise.all([
    input.store.contentOutcome.findMany({ take: 20000 }),
    input.store.outcomeAttribution.findMany({ take: 20000 }),
  ])
  const scopedOutcomes = outcomes.filter((row) => generationIds.has(row.generationId))
  const scopedAttributions = attributions.filter((row) => generationIds.has(row.generationId))

  // 每条内容取最成熟快照的成交数
  const matureSnapshots = pickMatureSnapshots(scopedOutcomes, input.end)

  const leadsByGeneration = new Map<string, { traceable: number; unknown: number }>()
  for (const row of scopedAttributions) {
    const bucket = leadsByGeneration.get(row.generationId) ?? { traceable: 0, unknown: 0 }
    if (row.attributionMethod === "explicit" || row.attributionMethod === "first_touch") bucket.traceable += 1
    else bucket.unknown += 1
    leadsByGeneration.set(row.generationId, bucket)
  }

  const grouped = aggregateCustomerTasks({ generations, matureSnapshots, leadsByGeneration })

  const rows: BenchmarkRow[] = [...grouped.entries()]
    .map(([contentTask, total]) => {
      const dealCount = total.dealKnown > 0 ? total.dealSum : null
      return {
        contentTask,
        customerCount: total.customerCount,
        publishedCount: total.publishedCount,
        traceableLeadCount: total.traceable,
        unknownLeadCount: total.unknown,
        dealCount,
        leadRate: rate(total.traceable, total.publishedCount),
        dealRate: rate(dealCount, total.publishedCount),
        sampleNote: total.customerCount < MIN_ACTIVE_CUSTOMERS
          ? `样本不足（${total.customerCount} 个客户），仅列事实，不下结论`
          : null,
      }
    })
    .sort((a, b) => {
      if (a.contentTask === UNSPECIFIED_TASK) return 1
      if (b.contentTask === UNSPECIFIED_TASK) return -1
      if (b.traceableLeadCount !== a.traceableLeadCount) return b.traceableLeadCount - a.traceableLeadCount
      return b.publishedCount - a.publishedCount
    })

  return {
    windowDays: input.windowDays,
    activeCustomerCount,
    rows,
    disclaimer: buildDisclaimer(activeCustomerCount),
  }
}

function buildDisclaimer(activeCustomerCount: number): string {
  if (activeCustomerCount < MIN_ACTIVE_CUSTOMERS) {
    return `样本不足（活跃客户 ${activeCustomerCount} < ${MIN_ACTIVE_CUSTOMERS}），仅内部参考，禁止对外`
  }
  return "内部参考：跨客户聚合，空值未计入分母"
}

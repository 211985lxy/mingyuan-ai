/**
 * 客户分群经营描述统计（WP-7）纯域层。
 *
 * 规则：
 * - 第一版只做描述性统计，不预测成交概率。
 * - 单分群样本 < MIN_TREND_SAMPLE（默认 10）只展示数据，不输出趋势判断。
 * - 所有结果必须可回到外部记录 ID 与计算窗口。
 */

export const COHORT_DIMENSIONS = [
  "industry",
  "product_type",
  "deal_size_band",
  "acquisition_channel",
  "customer_stage",
  "urgency",
] as const
export type CohortDimension = (typeof COHORT_DIMENSIONS)[number]

/** 样本少于此数：只展示数据，不给趋势 */
export const MIN_TREND_SAMPLE = 10

export type CohortTrendVerdict = "up" | "down" | "flat" | "insufficient_sample"

export interface CohortRecord {
  /** 外部正本记录 ID（飞书等） */
  externalRecordId: string
  dimension: CohortDimension
  /** 分群取值，如「教培」「高客单」 */
  segmentKey: string
  /** 线索→预约→成交→回款→客户结果 漏斗计数（0/1 或件数） */
  leadCount: number
  appointmentCount: number
  dealCount: number
  paymentCount: number
  customerOutcomeSuccessCount: number
  /** 周期（天）；缺省不参与平均 */
  dealCycleDays?: number | null
  deliveryCycleDays?: number | null
  /** 成功任务平均成本 */
  successTaskCostCny?: number | null
  successTaskCount?: number
  successTaskTotalCostCny?: number
  /** 案例是否批准 */
  caseApproved?: boolean | null
  /** 计算窗口 */
  windowStart: Date | string
  windowEnd: Date | string
}

export interface CohortMetricRates {
  leadToAppointmentRate: number | null
  appointmentToDealRate: number | null
  dealToPaymentRate: number | null
  paymentToOutcomeRate: number | null
  avgDealCycleDays: number | null
  avgDeliveryCycleDays: number | null
  avgSuccessTaskCostCny: number | null
  caseApprovalRate: number | null
}

export interface CohortSegmentStats extends CohortMetricRates {
  dimension: CohortDimension
  segmentKey: string
  sampleSize: number
  /** 可回读的外部记录 */
  externalRecordIds: string[]
  windowStart: string
  windowEnd: string
  /** 样本不足时强制 insufficient_sample，禁止业务侧当趋势用 */
  trendVerdict: CohortTrendVerdict
  /** 给人看的说明 */
  trendNote: string
}

export interface PreviousCohortMetric {
  leadToAppointmentRate: number | null
  sampleSize: number
}

const DIMENSION_SET = new Set<string>(COHORT_DIMENSIONS)

export function isCohortDimension(value: unknown): value is CohortDimension {
  return typeof value === "string" && DIMENSION_SET.has(value)
}

function safeRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null
  }
  return numerator / denominator
}

function avgNullable(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function computeRatesFromTotals(input: {
  leadCount: number
  appointmentCount: number
  dealCount: number
  paymentCount: number
  customerOutcomeSuccessCount: number
  dealCycleDays: Array<number | null | undefined>
  deliveryCycleDays: Array<number | null | undefined>
  successTaskCosts: Array<number | null | undefined>
  successTaskCount?: number
  successTaskTotalCostCny?: number
  caseApprovedFlags: Array<boolean | null | undefined>
}): CohortMetricRates {
  const caseFlags = input.caseApprovedFlags.filter((v): v is boolean => typeof v === "boolean")
  return {
    leadToAppointmentRate: safeRate(input.appointmentCount, input.leadCount),
    appointmentToDealRate: safeRate(input.dealCount, input.appointmentCount),
    dealToPaymentRate: safeRate(input.paymentCount, input.dealCount),
    paymentToOutcomeRate: safeRate(input.customerOutcomeSuccessCount, input.paymentCount),
    avgDealCycleDays: avgNullable(input.dealCycleDays),
    avgDeliveryCycleDays: avgNullable(input.deliveryCycleDays),
    avgSuccessTaskCostCny:
      input.successTaskCount && input.successTaskCount > 0
        ? (input.successTaskTotalCostCny ?? 0) / input.successTaskCount
        : avgNullable(input.successTaskCosts),
    caseApprovalRate:
      caseFlags.length === 0
        ? null
        : caseFlags.filter(Boolean).length / caseFlags.length,
  }
}

/**
 * 趋势判断：样本 < minSample 一律 insufficient_sample。
 * 有对照期时才比较；否则 flat（仍要求样本足够）。
 */
export function resolveTrendVerdict(input: {
  sampleSize: number
  currentRate: number | null
  previousRate?: number | null
  previousSampleSize?: number
  minSample?: number
  epsilon?: number
}): { verdict: CohortTrendVerdict; note: string } {
  const minSample = input.minSample ?? MIN_TREND_SAMPLE
  if (input.sampleSize < minSample) {
    return {
      verdict: "insufficient_sample",
      note: `样本 ${input.sampleSize} < ${minSample}，只展示数据，不输出趋势判断`,
    }
  }
  if (
    input.previousRate !== undefined
    && (input.previousSampleSize ?? 0) < minSample
  ) {
    return {
      verdict: "insufficient_sample",
      note: `对照期样本 ${input.previousSampleSize ?? 0} < ${minSample}，只展示数据，不输出趋势判断`,
    }
  }
  if (input.currentRate == null) {
    return { verdict: "flat", note: "当前比率缺失，不做方向判断" }
  }
  if (input.previousRate == null || !Number.isFinite(input.previousRate)) {
    return { verdict: "flat", note: "无对照期，仅描述当前水平" }
  }
  const epsilon = input.epsilon ?? 0.02
  const delta = input.currentRate - input.previousRate
  if (delta > epsilon) return { verdict: "up", note: `较对照期上升 ${(delta * 100).toFixed(1)}pt` }
  if (delta < -epsilon) return { verdict: "down", note: `较对照期下降 ${(Math.abs(delta) * 100).toFixed(1)}pt` }
  return { verdict: "flat", note: "较对照期持平" }
}

function computeGroupRates(rows: CohortRecord[]): CohortMetricRates {
  const count = (value: number) =>
    Number.isFinite(value) ? Math.max(0, value) : 0
  const leadCount = rows.reduce((sum, row) => sum + count(row.leadCount), 0)
  const appointmentCount = rows.reduce(
    (sum, row) => sum + count(row.appointmentCount),
    0,
  )
  const dealCount = rows.reduce((sum, row) => sum + count(row.dealCount), 0)
  const paymentCount = rows.reduce((sum, row) => sum + count(row.paymentCount), 0)
  const customerOutcomeSuccessCount = rows.reduce(
    (sum, row) => sum + count(row.customerOutcomeSuccessCount),
    0,
  )
  const successTaskCount = rows.reduce(
    (sum, row) => sum + count(row.successTaskCount ?? 0),
    0,
  )
  const successTaskTotalCostCny = rows.reduce(
    (sum, row) => sum + count(row.successTaskTotalCostCny ?? 0),
    0,
  )
  return computeRatesFromTotals({
    leadCount,
    appointmentCount,
    dealCount,
    paymentCount,
    customerOutcomeSuccessCount,
    dealCycleDays: rows.map((row) => row.dealCycleDays),
    deliveryCycleDays: rows.map((row) => row.deliveryCycleDays),
    successTaskCosts: rows.map((row) => row.successTaskCostCny),
    successTaskCount,
    successTaskTotalCostCny,
    caseApprovedFlags: rows.map((row) => row.caseApproved),
  })
}

/** 按维度+分群键聚合描述统计 */
export function aggregateCohortStats(
  records: CohortRecord[],
  options?: {
    minSample?: number
    /** dimension::segmentKey → 对照期主转化率与样本量，可选 */
    previousLeadToAppointmentByGroup?: Record<string, PreviousCohortMetric>
  },
): CohortSegmentStats[] {
  const minSample = options?.minSample ?? MIN_TREND_SAMPLE
  const groups = new Map<string, CohortRecord[]>()

  for (const row of records) {
    if (!isCohortDimension(row.dimension)) continue
    if (!row.externalRecordId.trim() || !row.segmentKey.trim()) continue
    const startMs = new Date(row.windowStart).getTime()
    const endMs = new Date(row.windowEnd).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) continue
    const key = `${row.dimension}::${row.segmentKey}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const results: CohortSegmentStats[] = []
  for (const [, rows] of groups) {
    const first = rows[0]
    const rates = computeGroupRates(rows)

    const windowStart = rows
      .map((r) => new Date(r.windowStart).getTime())
      .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY)
    const windowEnd = rows
      .map((r) => new Date(r.windowEnd).getTime())
      .reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY)

    const groupKey = `${first.dimension}::${first.segmentKey}`
    const previous = options?.previousLeadToAppointmentByGroup?.[groupKey]
    const trend = resolveTrendVerdict({
      sampleSize: rows.length,
      currentRate: rates.leadToAppointmentRate,
      previousRate: previous?.leadToAppointmentRate,
      previousSampleSize: previous?.sampleSize,
      minSample,
    })

    results.push({
      dimension: first.dimension,
      segmentKey: first.segmentKey,
      sampleSize: rows.length,
      externalRecordIds: rows.map((r) => r.externalRecordId),
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
      ...rates,
      trendVerdict: trend.verdict,
      trendNote: trend.note,
    })
  }

  return results.sort((a, b) => a.dimension.localeCompare(b.dimension) || a.segmentKey.localeCompare(b.segmentKey))
}

/** 业务侧读取趋势前必须经过此门闩 */
export function assertTrendAllowed(stats: CohortSegmentStats, minSample = MIN_TREND_SAMPLE): void {
  if (stats.sampleSize < minSample || stats.trendVerdict === "insufficient_sample") {
    throw new Error(
      `分群「${stats.segmentKey}」样本 ${stats.sampleSize} < ${minSample}，禁止输出趋势判断`,
    )
  }
}

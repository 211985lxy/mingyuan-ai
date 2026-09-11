import { prisma } from "@/lib/prisma"
import { loadReviewMetricsSnapshot } from "@/lib/aim/review-cycle-metrics"
import type { ReviewCycleFilters, ReviewMetricsSnapshot } from "@/lib/aim/review-cycle"
import { statisticsQueryFailuresTotal } from "@/lib/metrics"
import { parseShanghaiDateRange, type ShanghaiDateRange } from "@/lib/shanghai-time"
import type { ControlCenterFilters, ControlCenterFreshness, CoverageSummary } from "@/lib/control-center-contracts"

const TRACE_LIMIT = 10_000
const CHANNEL_METRICS = [
  "received", "duplicate", "rate_limited", "ingress_rejected",
  "pipeline_started", "pipeline_completed", "pipeline_failed", "reply_sent", "reply_dead_letter",
] as const

interface TraceRow {
  id: string
  runId: string | null
  projectId: string | null
  agentId: string | null
  status: string
  durationMs: number | null
  totalTokens: number | null
  costCny: unknown
  createdAt: Date
  updatedAt: Date
  aimGenerationId: string | null
}

interface DailyChannelRow {
  day: string
  platform: string
  metric: string
  count: number
}

export interface StatisticsOverviewInput {
  range: ShanghaiDateRange
  filters: ControlCenterFilters
  humanHourlyCostCny?: number
  now?: Date
}

export interface StatisticsOverviewResponse {
  period: { from: string; to: string; timezone: "Asia/Shanghai"; previousFrom: string; previousTo: string }
  freshness: ControlCenterFreshness[]
  operations: {
    runCount: number | null
    successCount: number | null
    failedCount: number | null
    staleRunningCount: number | null
    successRate: number | null
    p50DurationMs: number | null
    p95DurationMs: number | null
    totalTokens: number | null
    totalCostCny: number | null
    coverage: CoverageSummary
  }
  business: ReviewMetricsSnapshot | null
  previousBusiness: ReviewMetricsSnapshot | null
  channels: { days: Array<Record<string, number | string>>; total: Record<string, number>; degraded: boolean; reason?: string }
  comparison: Record<string, { current: number | null; previous: number | null; delta: number | null; rate: number | null }>
  degradedSources: string[]
}

function getTraceDelegate() {
  const delegate = (prisma as unknown as { aimExecutionTrace?: unknown }).aimExecutionTrace
  if (!delegate || typeof delegate !== "object" || typeof (delegate as { findMany?: unknown }).findMany !== "function") return undefined
  return delegate as { findMany(args: unknown): Promise<TraceRow[]> }
}

function getRunEventDelegate() {
  const delegate = (prisma as unknown as { aimRunEvent?: unknown }).aimRunEvent
  if (!delegate || typeof delegate !== "object" || typeof (delegate as { findMany?: unknown }).findMany !== "function") return undefined
  return delegate as { findMany(args: unknown): Promise<Array<{ runId: string }>> }
}

function getChannelDelegate() {
  const delegate = (prisma as unknown as { channelMetricDaily?: unknown }).channelMetricDaily
  if (!delegate || typeof delegate !== "object" || typeof (delegate as { findMany?: unknown }).findMany !== "function") return undefined
  return delegate as { findMany(args: unknown): Promise<DailyChannelRow[]> }
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return sorted[index] ?? null
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

async function loadTraces(input: StatisticsOverviewInput): Promise<TraceRow[]> {
  const delegate = getTraceDelegate()
  if (!delegate) throw new Error("AimExecutionTrace client is not generated")
  const where: Record<string, unknown> = {
    createdAt: { gte: input.range.start, lt: input.range.end },
    ...(input.filters.projectId ? { projectId: input.filters.projectId } : {}),
    ...(input.filters.agentId ? { agentId: input.filters.agentId } : {}),
  }
  if (input.filters.channel) {
    const events = getRunEventDelegate()
    if (events) {
      const rows = await events.findMany({ where: { channel: input.filters.channel, createdAt: { gte: input.range.start, lt: input.range.end } }, select: { runId: true }, distinct: ["runId"], take: TRACE_LIMIT + 1 })
      if (rows.length > TRACE_LIMIT) throw new Error("渠道运行数超过 10000，请缩短周期")
      where.runId = { in: rows.map((row) => row.runId) }
    }
  }
  const traces = await delegate.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: TRACE_LIMIT + 1, select: { id: true, runId: true, projectId: true, agentId: true, status: true, durationMs: true, totalTokens: true, costCny: true, createdAt: true, updatedAt: true, aimGenerationId: true } })
  if (traces.length > TRACE_LIMIT) throw new Error("执行记录超过 10000，请缩短周期")
  return traces
}

function summarizeOperations(traces: TraceRow[], now: Date) {
  const terminal = traces.filter((trace) => trace.status === "success" || trace.status === "failed")
  const durations = terminal.flatMap((trace) => trace.durationMs != null && trace.durationMs >= 0 ? [trace.durationMs] : [])
  const tokenValues = traces.flatMap((trace) => trace.totalTokens != null && trace.totalTokens >= 0 ? [trace.totalTokens] : [])
  const costValues = traces.flatMap((trace) => {
    const value = finiteNumber(trace.costCny)
    return value != null && value >= 0 ? [value] : []
  })
  const withRunId = traces.filter((trace) => Boolean(trace.runId)).length
  return {
    runCount: traces.length,
    successCount: traces.filter((trace) => trace.status === "success").length,
    failedCount: traces.filter((trace) => trace.status === "failed").length,
    staleRunningCount: traces.filter((trace) => trace.status === "running" && now.getTime() - trace.updatedAt.getTime() > 10 * 60 * 1000).length,
    successRate: ratio(terminal.filter((trace) => trace.status === "success").length, terminal.length),
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    totalTokens: tokenValues.length === traces.length ? tokenValues.reduce((sum, value) => sum + value, 0) : null,
    totalCostCny: costValues.length === traces.length ? costValues.reduce((sum, value) => sum + value, 0) : null,
    coverage: { available: withRunId, total: traces.length, ratio: ratio(withRunId, traces.length), reason: traces.length === 0 ? "周期内没有执行记录" : undefined },
  }
}

function unavailableOperations(reason: string) {
  return {
    runCount: null,
    successCount: null,
    failedCount: null,
    staleRunningCount: null,
    successRate: null,
    p50DurationMs: null,
    p95DurationMs: null,
    totalTokens: null,
    totalCostCny: null,
    coverage: { available: null, total: null, ratio: null, reason },
  }
}

function listShanghaiDays(range: ShanghaiDateRange): string[] {
  const days: string[] = []
  let day = range.from
  while (day <= range.to) {
    days.push(day)
    day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(new Date(`${day}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000))
  }
  return days
}

async function loadChannels(input: StatisticsOverviewInput): Promise<StatisticsOverviewResponse["channels"]> {
  const delegate = getChannelDelegate()
  if (!delegate) return { days: [], total: {}, degraded: true, reason: "ChannelMetricDaily client is not generated" }
  try {
    const rows = await delegate.findMany({ where: { day: { gte: input.range.from, lte: input.range.to }, ...(input.filters.channel ? { platform: input.filters.channel } : {}) }, orderBy: [{ day: "asc" }, { platform: "asc" }, { metric: "asc" }], take: 10_000 })
    const byDay = new Map<string, Record<string, number | string>>()
    for (const day of listShanghaiDays(input.range)) byDay.set(day, { day })
    const total: Record<string, number> = {}
    for (const row of rows) {
      const day = byDay.get(row.day) ?? { day: row.day }
      day[`${row.platform}.${row.metric}`] = row.count
      byDay.set(row.day, day)
      total[`${row.platform}.${row.metric}`] = (total[`${row.platform}.${row.metric}`] ?? 0) + row.count
    }
    return { days: [...byDay.values()], total, degraded: false }
  } catch {
    statisticsQueryFailuresTotal.inc({ source: "channel_metric_daily" })
    return { days: [], total: {}, degraded: true, reason: "渠道日指标查询失败" }
  }
}

function previousRange(range: ShanghaiDateRange): ShanghaiDateRange {
  const duration = range.end.getTime() - range.start.getTime()
  const start = new Date(range.start.getTime() - duration)
  const end = range.start
  const from = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(start)
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(end.getTime() - 24 * 60 * 60 * 1000))
  return { from, to, start, end }
}

function compareMetric(current: number | null, previous: number | null) {
  if (current == null || previous == null) return { current, previous, delta: null, rate: null }
  return { current, previous, delta: current - previous, rate: previous === 0 ? null : (current - previous) / Math.abs(previous) }
}

async function loadBusiness(range: ShanghaiDateRange, filters: ControlCenterFilters, humanHourlyCostCny: number): Promise<ReviewMetricsSnapshot> {
  return loadReviewMetricsSnapshot({
    periodStart: range.start,
    periodEnd: range.end,
    filters: {
      projectId: filters.projectId,
      channel: filters.channel as ReviewCycleFilters["channel"],
    },
    humanHourlyCostCny,
  })
}

export async function loadStatisticsOverview(input: StatisticsOverviewInput): Promise<StatisticsOverviewResponse> {
  const now = input.now ?? new Date()
  const previous = previousRange(input.range)
  const degradedSources: string[] = []
  let traces: TraceRow[] | null = null
  let previousTraces: TraceRow[] | null = null
  try {
    traces = await loadTraces(input)
    previousTraces = await loadTraces({ ...input, range: previous })
  } catch {
    degradedSources.push("aim_execution_trace")
    statisticsQueryFailuresTotal.inc({ source: "aim_execution_trace" })
  }
  let business: ReviewMetricsSnapshot | null = null
  let previousBusiness: ReviewMetricsSnapshot | null = null
  try {
    business = await loadBusiness(input.range, input.filters, input.humanHourlyCostCny ?? 0)
    previousBusiness = await loadBusiness(previous, input.filters, input.humanHourlyCostCny ?? 0)
  } catch {
    degradedSources.push("review_metrics")
    statisticsQueryFailuresTotal.inc({ source: "review_metrics" })
  }
  const channels = await loadChannels(input)
  if (channels.degraded) degradedSources.push("channel_metric_daily")
  const operations = traces ? summarizeOperations(traces, now) : unavailableOperations("执行记录查询失败")
  const previousOperations = previousTraces ? summarizeOperations(previousTraces, input.range.start) : unavailableOperations("执行记录查询失败")
  const comparison = {
    runCount: compareMetric(operations.runCount, previousOperations.runCount),
    successRate: compareMetric(operations.successRate, previousOperations.successRate),
    dealCount: compareMetric(business?.dealCount ?? null, previousBusiness?.dealCount ?? null),
    revenue: compareMetric(business?.revenue ?? null, previousBusiness?.revenue ?? null),
    paymentCount: compareMetric(business?.paymentCount ?? null, previousBusiness?.paymentCount ?? null),
  }
  const freshness: ControlCenterFreshness[] = [
    { source: "aim_execution_trace", lastUpdatedAt: traces?.length ? traces[traces.length - 1].updatedAt.toISOString() : null, lagMs: traces?.length ? Math.max(0, now.getTime() - traces[traces.length - 1].updatedAt.getTime()) : null, degraded: degradedSources.includes("aim_execution_trace"), reason: degradedSources.includes("aim_execution_trace") ? "执行记录查询失败" : undefined },
    { source: "review_metrics", lastUpdatedAt: business ? now.toISOString() : null, lagMs: business ? 0 : null, degraded: degradedSources.includes("review_metrics"), reason: degradedSources.includes("review_metrics") ? "业务指标查询失败" : undefined },
    { source: "channel_metric_daily", lastUpdatedAt: channels.degraded ? null : now.toISOString(), lagMs: channels.degraded ? null : 0, degraded: channels.degraded, reason: channels.reason },
  ]
  return {
    period: { from: input.range.from, to: input.range.to, timezone: "Asia/Shanghai", previousFrom: previous.from, previousTo: previous.to },
    freshness,
    operations,
    business,
    previousBusiness,
    channels,
    comparison,
    degradedSources,
  }
}

export function parseStatisticsRange(params: URLSearchParams): ShanghaiDateRange | { error: string } {
  return parseShanghaiDateRange(params)
}

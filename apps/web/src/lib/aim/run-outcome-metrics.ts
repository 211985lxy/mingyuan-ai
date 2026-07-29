import {
  computeFullyLoadedCost,
  computeTimeSavedMinutes,
  isAcceptedDisposition,
  isReviewedDisposition,
  parseRunOutcomeMetadata,
  reduceFinalDisposition,
  type FinalDisposition,
  type RunOutcomeChannel,
} from "@/lib/aim/run-outcome-telemetry"

export interface OutcomeMetricEvent {
  runId: string
  event: string
  metadata: unknown
  createdAt: Date
}

export interface OutcomeMetricTrace {
  runId: string | null
  durationMs: number | null
  costCny: unknown
  createdAt: Date
}

export interface RunOutcomeMetricFilters {
  workflowId?: string
  taskType?: string
  channel?: RunOutcomeChannel
}

export interface RunOutcomeMetrics {
  runCount: number
  reviewedCount: number
  acceptedCount: number
  firstPassAcceptedCount: number
  rewriteCount: number
  rejectedCount: number
  unknownCount: number
  acceptanceRate: number | null
  firstPassAcceptanceRate: number | null
  rewriteRate: number | null
  rejectionRate: number | null
  timeSavedMinutes: number
  aiDirectCostCny: number
  fullyLoadedCostCny: number
  directCostPerSuccessfulTaskCny: number | null
  fullyLoadedCostPerSuccessfulTaskCny: number | null
  coverage: {
    runId: number
    duration: number
    cost: number
    finalDisposition: number
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(typeof value === "object" && "toString" in value
    ? (value as { toString(): string }).toString()
    : value)
  return Number.isFinite(parsed) ? parsed : null
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function matchesFilters(
  events: OutcomeMetricEvent[],
  filters: RunOutcomeMetricFilters,
): boolean {
  if (!filters.workflowId && !filters.taskType && !filters.channel) return true
  return events.some((event) => {
    const metadata = parseRunOutcomeMetadata(event.metadata)
    if (!metadata) return false
    return (
      (!filters.workflowId || metadata.workflowId === filters.workflowId)
      && (!filters.taskType || metadata.taskType === filters.taskType)
      && (!filters.channel || metadata.channel === filters.channel)
    )
  })
}

function latestMetadata(events: OutcomeMetricEvent[]) {
  return [...events]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((event) => parseRunOutcomeMetadata(event.metadata))
    .find((metadata) => metadata != null) ?? null
}

function groupEventsByRun(events: OutcomeMetricEvent[]) {
  const grouped = new Map<string, OutcomeMetricEvent[]>()
  for (const event of events) {
    const bucket = grouped.get(event.runId) ?? []
    bucket.push(event)
    grouped.set(event.runId, bucket)
  }
  return grouped
}

function summarizeOutcomeEvents(
  eventsByRun: Map<string, OutcomeMetricEvent[]>,
  includedRuns: Set<string>,
  hasFilters: boolean,
) {
  const counts = {
    reviewedCount: 0,
    acceptedCount: 0,
    firstPassAcceptedCount: 0,
    rewriteCount: 0,
    rejectedCount: 0,
    unknownCount: 0,
    timeSavedMinutes: 0,
    humanMinutes: 0,
  }
  for (const [runId, events] of eventsByRun) {
    if ((includedRuns.size > 0 && !includedRuns.has(runId)) || (includedRuns.size === 0 && hasFilters)) continue
    const disposition = reduceFinalDisposition(events)
    const metadata = latestMetadata(events)
    if (disposition === "unknown") counts.unknownCount += 1
    if (isReviewedDisposition(disposition)) counts.reviewedCount += 1
    if (isAcceptedDisposition(disposition)) counts.acceptedCount += 1
    if (disposition === "accepted_first_pass") counts.firstPassAcceptedCount += 1
    if (disposition === "rejected") counts.rejectedCount += 1
    const wasRewritten = events.some((event) =>
      event.event === "revised"
      || event.event === "edited"
      || parseRunOutcomeMetadata(event.metadata)?.finalDisposition === "rewrite_requested"
    )
    if (isReviewedDisposition(disposition) && wasRewritten) counts.rewriteCount += 1
    if (metadata) {
      counts.humanMinutes += metadata.humanActiveMinutes
      counts.timeSavedMinutes += computeTimeSavedMinutes(
        metadata.manualBaselineMinutes,
        metadata.humanActiveMinutes,
      ) ?? 0
    }
  }
  return counts
}

function summarizeTraceCosts(traces: OutcomeMetricTrace[]) {
  const unique = new Map<string, OutcomeMetricTrace>()
  for (const trace of traces) {
    if (trace.runId && !unique.has(trace.runId)) unique.set(trace.runId, trace)
  }
  let aiDirectCostCny = 0
  let durationCovered = 0
  let costCovered = 0
  for (const trace of unique.values()) {
    if (trace.durationMs != null) durationCovered += 1
    const cost = toFiniteNumber(trace.costCny)
    if (cost != null) {
      costCovered += 1
      aiDirectCostCny += cost
    }
  }
  return { unique, aiDirectCostCny, durationCovered, costCovered }
}

/**
 * 聚合 append-only 终态事件。AI 成本按 run 去重，历史无结构终态计入 unknown。
 */
export function aggregateRunOutcomeMetrics(input: {
  events: OutcomeMetricEvent[]
  traces: OutcomeMetricTrace[]
  humanHourlyCostCny: number
  filters?: RunOutcomeMetricFilters
}): RunOutcomeMetrics {
  const hasFilters = Boolean(
    input.filters?.workflowId || input.filters?.taskType || input.filters?.channel,
  )
  const eventsByRun = groupEventsByRun(input.events)
  const filteredRuns = new Set(
    [...eventsByRun.entries()]
      .filter(([, events]) => matchesFilters(events, input.filters ?? {}))
      .map(([runId]) => runId),
  )
  const traces = input.traces.filter((trace) =>
    trace.runId != null
      ? (
        filteredRuns.size === 0
        && hasFilters
          ? false
          : filteredRuns.size === 0 || filteredRuns.has(trace.runId)
      )
      : !hasFilters,
  )
  const outcome = summarizeOutcomeEvents(eventsByRun, filteredRuns, hasFilters)
  const trace = summarizeTraceCosts(traces)
  const traceCount = traces.length
  const withRunIdCount = traces.filter((trace) => Boolean(trace.runId)).length
  const finalDispositionCount = [...eventsByRun.entries()]
    .filter(([runId, events]) =>
      trace.unique.has(runId)
      && (!hasFilters || filteredRuns.has(runId))
      && reduceFinalDisposition(events) !== "unknown"
    ).length
  const fullyLoadedCostCny = computeFullyLoadedCost(
    trace.aiDirectCostCny,
    outcome.humanMinutes,
    input.humanHourlyCostCny,
  )
  const { humanMinutes: _humanMinutes, ...publicOutcome } = outcome

  return {
    runCount: trace.unique.size,
    ...publicOutcome,
    unknownCount: Math.max(
      publicOutcome.unknownCount,
      trace.unique.size - finalDispositionCount,
    ),
    acceptanceRate: rate(outcome.acceptedCount, outcome.reviewedCount),
    firstPassAcceptanceRate: rate(outcome.firstPassAcceptedCount, outcome.reviewedCount),
    rewriteRate: rate(outcome.rewriteCount, outcome.reviewedCount),
    rejectionRate: rate(outcome.rejectedCount, outcome.reviewedCount),
    aiDirectCostCny: trace.aiDirectCostCny,
    fullyLoadedCostCny,
    directCostPerSuccessfulTaskCny: rate(trace.aiDirectCostCny, outcome.acceptedCount),
    fullyLoadedCostPerSuccessfulTaskCny: rate(fullyLoadedCostCny, outcome.acceptedCount),
    coverage: {
      runId: rate(withRunIdCount, traceCount) ?? 0,
      duration: rate(trace.durationCovered, trace.unique.size) ?? 0,
      cost: rate(trace.costCovered, trace.unique.size) ?? 0,
      finalDisposition: rate(finalDispositionCount, trace.unique.size) ?? 0,
    },
  }
}

export function isSuccessfulDisposition(
  disposition: FinalDisposition | "unknown",
): boolean {
  return isAcceptedDisposition(disposition)
}

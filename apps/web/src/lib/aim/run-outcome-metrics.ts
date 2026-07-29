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
  id: string
  runId: string
  event: string
  metadata: unknown
  createdAt: Date
}

export interface OutcomeMetricTrace {
  id: string
  runId: string | null
  durationMs: number | null
  costCny: unknown
  aimGenerationId?: string | null
  createdAt: Date
  updatedAt: Date
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
    generationLink: number
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
  const metadata = latestMetadata(events)
  return Boolean(metadata
    && (!filters.workflowId || metadata.workflowId === filters.workflowId)
    && (!filters.taskType || metadata.taskType === filters.taskType)
    && (!filters.channel || metadata.channel === filters.channel))
}

function latestMetadata(events: OutcomeMetricEvent[]) {
  return [...events]
    .sort((left, right) =>
      right.createdAt.getTime() - left.createdAt.getTime()
      || right.id.localeCompare(left.id))
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
  for (const runId of includedRuns) {
    const events = eventsByRun.get(runId) ?? []
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

function compareTrace(left: OutcomeMetricTrace, right: OutcomeMetricTrace) {
  return left.updatedAt.getTime() - right.updatedAt.getTime()
    || left.createdAt.getTime() - right.createdAt.getTime()
    || left.id.localeCompare(right.id)
}

function canonicalizeTraces(traces: OutcomeMetricTrace[]) {
  const unique = new Map<string, OutcomeMetricTrace>()
  for (const trace of traces) {
    if (!trace.runId) continue
    const current = unique.get(trace.runId)
    if (!current || compareTrace(trace, current) > 0) unique.set(trace.runId, trace)
  }
  return unique
}

function summarizeTraceCosts(unique: Map<string, OutcomeMetricTrace>) {
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
  return { aiDirectCostCny, durationCovered, costCovered }
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
  const eventsByRun = groupEventsByRun(input.events)
  const canonicalTraces = canonicalizeTraces(input.traces)
  const includedRuns = new Set(
    [...canonicalTraces.keys()].filter((runId) =>
      matchesFilters(eventsByRun.get(runId) ?? [], input.filters ?? {})),
  )
  const includedTraces = new Map(
    [...canonicalTraces.entries()].filter(([runId]) => includedRuns.has(runId)),
  )
  const outcome = summarizeOutcomeEvents(eventsByRun, includedRuns)
  const trace = summarizeTraceCosts(includedTraces)
  const hasFilters = Boolean(
    input.filters?.workflowId || input.filters?.taskType || input.filters?.channel,
  )
  const coverageTraces = hasFilters
    ? input.traces.filter((item) => item.runId != null && includedRuns.has(item.runId))
    : input.traces
  const traceCount = coverageTraces.length
  const withRunIdCount = coverageTraces.filter((item) => Boolean(item.runId)).length
  const withGenerationLinkCount = [...includedTraces.values()]
    .filter((item) => Boolean(item.aimGenerationId))
    .length
  const finalDispositionCount = [...includedRuns]
    .filter((runId) => reduceFinalDisposition(eventsByRun.get(runId) ?? []) !== "unknown")
    .length
  const fullyLoadedCostCny = computeFullyLoadedCost(
    trace.aiDirectCostCny,
    outcome.humanMinutes,
    input.humanHourlyCostCny,
  )
  const { humanMinutes: _humanMinutes, ...publicOutcome } = outcome

  return {
    runCount: includedRuns.size,
    ...publicOutcome,
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
      duration: rate(trace.durationCovered, includedRuns.size) ?? 0,
      cost: rate(trace.costCovered, includedRuns.size) ?? 0,
      finalDisposition: rate(finalDispositionCount, includedRuns.size) ?? 0,
      generationLink: rate(withGenerationLinkCount, includedRuns.size) ?? 0,
    },
  }
}

export function isSuccessfulDisposition(
  disposition: FinalDisposition | "unknown",
): boolean {
  return isAcceptedDisposition(disposition)
}

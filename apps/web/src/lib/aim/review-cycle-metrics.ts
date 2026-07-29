import {
  aggregateRunOutcomeMetrics,
} from "@/lib/aim/run-outcome-metrics"
import {
  computeActionCloseRate,
  computeRate,
  type ReviewCycleFilters,
  type ReviewMetricsSnapshot,
} from "@/lib/aim/review-cycle"
import { shouldAutoCreateFromCostOrLatency } from "@/lib/aim/learning-candidate"
import {
  computeWeeklyReview,
  type WeeklyReviewStorePort,
} from "@/lib/aim/weekly-review"
import { prisma } from "@/lib/prisma"

const TRACE_LIMIT = 10_000
const EVENT_LIMIT = 100_000

function traceWhere(
  start: Date,
  end: Date,
  filters: ReviewCycleFilters,
) {
  return {
    status: { in: ["success", "failed"] },
    updatedAt: { gte: start, lt: end },
    ...(filters.ownerId ? { userId: filters.ownerId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
  }
}

async function loadRunMetrics(input: {
  start: Date
  end: Date
  filters: ReviewCycleFilters
  humanHourlyCostCny: number
}) {
  const filteredEvents =
    input.filters.workflowId || input.filters.channel
      ? await prisma.aimRunEvent.findMany({
        where: {
          createdAt: { gte: input.start, lt: input.end },
          ...(input.filters.workflowId
            ? { workflowId: input.filters.workflowId }
            : {}),
          ...(input.filters.channel ? { channel: input.filters.channel } : {}),
        },
        select: { runId: true },
        distinct: ["runId"],
        take: TRACE_LIMIT + 1,
      })
      : null
  if (filteredEvents && filteredEvents.length > TRACE_LIMIT) {
    throw new Error("筛选后的运行数超过 10000，请缩短周期")
  }
  const allowedRunIds = filteredEvents?.map((row) => row.runId)
  const traces = await prisma.aimExecutionTrace.findMany({
    where: {
      ...traceWhere(input.start, input.end, input.filters),
      ...(allowedRunIds ? { runId: { in: allowedRunIds } } : {}),
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: TRACE_LIMIT + 1,
    select: {
      id: true,
      runId: true,
      durationMs: true,
      costCny: true,
      createdAt: true,
      updatedAt: true,
      aimGenerationId: true,
    },
  })
  if (traces.length > TRACE_LIMIT) throw new Error("运行数超过 10000，请缩短周期")
  const runIds = traces.flatMap((trace) => trace.runId ? [trace.runId] : [])
  const events = runIds.length
    ? await prisma.aimRunEvent.findMany({
      where: {
        runId: { in: runIds },
        createdAt: { gte: input.start, lt: input.end },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EVENT_LIMIT + 1,
      select: { id: true, runId: true, event: true, metadata: true, createdAt: true },
    })
    : []
  if (events.length > EVENT_LIMIT) throw new Error("终态事件超过 100000，请缩短周期")
  // 禁止窗口外泄漏：只保留 [start, end) 内事件
  const windowedEvents = events.filter((event) =>
    event.createdAt.getTime() >= input.start.getTime()
    && event.createdAt.getTime() < input.end.getTime())
  const metrics = aggregateRunOutcomeMetrics({
    traces,
    events: windowedEvents,
    humanHourlyCostCny: input.humanHourlyCostCny,
    filters: {
      workflowId: input.filters.workflowId,
      channel: input.filters.channel,
    },
  })
  const generationIds =
    input.filters.workflowId || input.filters.channel
      ? [...new Set(traces.flatMap((row) =>
        row.aimGenerationId ? [row.aimGenerationId] : []))]
      : undefined
  return { traces, events: windowedEvents, metrics, generationIds }
}

async function loadCandidateCounts(filters: ReviewCycleFilters) {
  const assetWhere = {
    reviewStatus: "pending",
    ...(filters.ownerId ? { userId: filters.ownerId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
  }
  const learningWhere = {
    reviewStatus: "pending",
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
  }
  const [
    pendingKnowledgeCandidates,
    pendingCaseCandidates,
    pendingMemoryCandidates,
    pendingEvalCandidates,
    pendingMethodologyCandidates,
  ] = await Promise.all([
    prisma.assetCandidate.count({
      where: { ...assetWhere, kind: { notIn: ["case_candidate", "methodology_revision"] } },
    }),
    prisma.assetCandidate.count({
      where: { ...assetWhere, kind: "case_candidate" },
    }),
    prisma.aimMemory.count({
      where: {
        status: "candidate",
        ...(filters.ownerId ? { userId: filters.ownerId } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
      },
    }),
    prisma.learningCandidate.count({
      where: { ...learningWhere, targetType: "eval_fixture" },
    }),
    prisma.learningCandidate.count({
      where: { ...learningWhere, targetType: "methodology_revision" },
    }),
  ])
  return {
    pendingKnowledgeCandidates,
    pendingCaseCandidates,
    pendingMemoryCandidates,
    pendingEvalCandidates,
    pendingMethodologyCandidates,
  }
}

function countFailures(
  rows: Array<{ failureCode: string | null; _count: { _all: number } }>,
  prefix: string,
): number {
  return rows.reduce(
    (sum, row) =>
      row.failureCode?.startsWith(prefix)
        ? sum + row._count._all
        : sum,
    0,
  )
}

async function loadBusinessReviewCounts(input: {
  periodStart: Date
  periodEnd: Date
  filters: ReviewCycleFilters
  generationIds?: string[]
}) {
  const generationFilter = input.generationIds
    ? { generationId: { in: input.generationIds } }
    : {}
  const [
    paymentCount,
    customerOutcomeCount,
    failures,
    humanTakeoverCount,
    candidates,
    previous,
  ] = await Promise.all([
    prisma.outcomeAttribution.count({
      where: {
        occurredAt: { gte: input.periodStart, lt: input.periodEnd },
        externalPaymentId: { not: null },
        ...(input.filters.ownerId ? { userId: input.filters.ownerId } : {}),
        ...generationFilter,
        ...(input.filters.projectId
          ? { generation: { projectId: input.filters.projectId } }
          : {}),
      },
    }),
    prisma.customerOutcomeProjection.count({
      where: {
        reviewStatus: "approved",
        reviewedAt: { gte: input.periodStart, lt: input.periodEnd },
        ...(input.filters.projectId ? { projectId: input.filters.projectId } : {}),
        ...(input.filters.ownerId
          ? { project: { userId: input.filters.ownerId } }
          : {}),
      },
    }),
    prisma.learningCandidate.groupBy({
      by: ["failureCode"],
      where: {
        createdAt: { gte: input.periodStart, lt: input.periodEnd },
        failureCode: { not: null },
        ...(input.filters.projectId ? { projectId: input.filters.projectId } : {}),
      },
      _count: { _all: true },
      orderBy: { failureCode: "asc" },
      take: 200,
    }),
    prisma.aimRunEvent.count({
      where: {
        createdAt: { gte: input.periodStart, lt: input.periodEnd },
        reasonCode: "human_takeover",
        ...(input.filters.ownerId ? { userId: input.filters.ownerId } : {}),
        ...(input.filters.workflowId ? { workflowId: input.filters.workflowId } : {}),
        ...(input.filters.channel ? { channel: input.filters.channel } : {}),
      },
    }),
    loadCandidateCounts(input.filters),
    prisma.reviewCycle.findFirst({
      where: { status: "signed", periodEnd: { lte: input.periodStart } },
      include: { actions: true },
      orderBy: { periodEnd: "desc" },
    }),
  ])
  return {
    paymentCount,
    customerOutcomeCount,
    p0FailureCount: countFailures(failures, "P0_"),
    p1FailureCount: countFailures(failures, "P1_"),
    humanTakeoverCount,
    candidates,
    previousActionCloseRate: previous
      ? computeActionCloseRate(previous.actions)
      : null,
  }
}

export async function loadReviewMetricsSnapshot(input: {
  periodStart: Date
  periodEnd: Date
  filters: ReviewCycleFilters
  humanHourlyCostCny: number
}): Promise<ReviewMetricsSnapshot> {
  const run = await loadRunMetrics({
    start: input.periodStart,
    end: input.periodEnd,
    filters: input.filters,
    humanHourlyCostCny: input.humanHourlyCostCny,
  })
  const weekly = await computeWeeklyReview({
    userId: input.filters.ownerId,
    projectId: input.filters.projectId,
    generationIds: run.generationIds,
    start: input.periodStart,
    end: input.periodEnd,
    store: prisma as unknown as WeeklyReviewStorePort,
  })
  const counts = await loadBusinessReviewCounts({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    filters: input.filters,
    generationIds: run.generationIds,
  })
  return {
    publishedCount: weekly.publishedCount,
    qualifiedLeadCount: weekly.qualifiedLeadCount,
    appointmentCount: weekly.appointmentCount,
    dealCount: weekly.dealCount,
    revenue: weekly.revenue,
    paymentCount: counts.paymentCount,
    paymentAmountCny: null,
    customerOutcomeCount: counts.customerOutcomeCount,
    timeSavedMinutes: run.metrics.timeSavedMinutes,
    firstPassAcceptanceRate: run.metrics.firstPassAcceptanceRate,
    rewriteRate: run.metrics.rewriteRate,
    rejectionRate: run.metrics.rejectionRate,
    directCostPerSuccess: run.metrics.directCostPerSuccessfulTaskCny,
    fullyLoadedCost: run.metrics.fullyLoadedCostCny,
    p0FailureCount: counts.p0FailureCount,
    p1FailureCount: counts.p1FailureCount,
    humanTakeoverCount: counts.humanTakeoverCount,
    highCostAnomalyCount: run.traces.filter((trace) =>
      shouldAutoCreateFromCostOrLatency({
        costCny: trace.costCny == null ? null : Number(trace.costCny),
        durationMs: trace.durationMs,
      })).length,
    ...counts.candidates,
    previousActionCloseRate: counts.previousActionCloseRate,
    day7BackfillRate: computeRate(
      weekly.day7Backfill.filled,
      weekly.day7Backfill.due,
    ),
    runIdCoverage: run.metrics.coverage.runId,
    costCoverage: run.metrics.coverage.cost,
    finalDispositionCoverage: run.metrics.coverage.finalDisposition,
    generationLinkCoverage: run.metrics.coverage.generationLink,
  }
}

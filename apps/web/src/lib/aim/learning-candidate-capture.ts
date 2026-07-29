import {
  buildLearningRequestId,
  shouldAutoCreateFromCostOrLatency,
  shouldAutoCreateFromDisposition,
  shouldCreateFromVerdictCode,
  shouldSampleSuccessfulRun,
  validateLearningCandidateDraft,
  type LearningCandidateDraft,
} from "@/lib/aim/learning-candidate"
import {
  parseRunOutcomeMetadata,
  reduceFinalDisposition,
} from "@/lib/aim/run-outcome-telemetry"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

const TRACE_LIMIT = 10_000
const EVENT_LIMIT = 100_000
const OUTCOME_LIMIT = 10_000

export interface LearningTraceInput {
  id: string
  runId: string | null
  userId: string | null
  projectId: string | null
  aimGenerationId: string | null
  status: string
  durationMs: number | null
  costCny: unknown
  qualityStatus: string | null
  errorMessage: string | null
}

export interface LearningEventInput {
  id: string
  runId: string
  event: string
  metadata: unknown
  createdAt: Date
}

export interface LearningOutcomeInput {
  id: string
  projectId: string | null
  generationId: string
  verdictCode: string | null
  verdictNote: string | null
  collectWindowDay: number
}

function finite(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pushUnique(
  target: LearningCandidateDraft[],
  seen: Set<string>,
  draft: LearningCandidateDraft,
) {
  if (seen.has(draft.requestId)) return
  seen.add(draft.requestId)
  target.push(validateLearningCandidateDraft(draft))
}

type CandidateSink = (draft: LearningCandidateDraft) => void

function groupEventsByRun(events: LearningEventInput[]) {
  const grouped = new Map<string, LearningEventInput[]>()
  for (const event of events) {
    const rows = grouped.get(event.runId) ?? []
    rows.push(event)
    grouped.set(event.runId, rows)
  }
  return grouped
}

function dualTargets(failure: boolean): Array<"eval_fixture" | "methodology_revision"> {
  return failure
    ? ["eval_fixture", "methodology_revision"]
    : ["eval_fixture"]
}

function buildTraceDrafts(
  traces: LearningTraceInput[],
  eventsByRun: Map<string, LearningEventInput[]>,
  add: CandidateSink,
) {
  for (const trace of traces) {
    const runEvents = trace.runId ? eventsByRun.get(trace.runId) ?? [] : []
    const disposition = reduceFinalDisposition(runEvents)
    const highCost = shouldAutoCreateFromCostOrLatency({
      costCny: finite(trace.costCny),
      durationMs: trace.durationMs,
    })
    const failed = trace.status === "failed" || trace.qualityStatus === "fail"
    const sampled = trace.status === "success"
      && (
        disposition === "accepted_first_pass"
        || disposition === "accepted_after_edit"
      )
      && shouldSampleSuccessfulRun(trace.runId ?? trace.id)
    if (!failed && !highCost && !sampled) continue
    const failureCode =
      trace.qualityStatus === "fail"
        ? "quality_failed"
        : trace.status === "failed"
          ? "trace_failed"
          : highCost
            ? "cost_or_latency_anomaly"
            : undefined
    const captureReason = failed
      ? "failure"
      : highCost
        ? "cost_or_latency"
        : "success_sample_10pct"
    for (const targetType of dualTargets(failed || highCost)) {
      add({
        sourceType: "trace",
        sourceId: trace.id,
        projectId: trace.projectId ?? undefined,
        generationId: trace.aimGenerationId ?? undefined,
        targetType,
        failureCode,
        payload: {
          runId: trace.runId,
          status: trace.status,
          qualityStatus: trace.qualityStatus,
          durationMs: trace.durationMs,
          costCny: finite(trace.costCny),
          errorMessage: trace.errorMessage?.slice(0, 1000) || null,
          disposition,
          captureReason,
        },
        requestId: buildLearningRequestId("trace", trace.id, targetType),
      })
    }
  }
}

/**
 * 逐条 structured rewrite_requested/rejected 建候选；
 * 后续 accepted_after_edit 不能吞掉早先重写/拒绝。
 */
function buildEventDrafts(
  eventsByRun: Map<string, LearningEventInput[]>,
  add: CandidateSink,
) {
  for (const [runId, events] of eventsByRun) {
    for (const event of events) {
      const metadata = parseRunOutcomeMetadata(event.metadata)
      if (!metadata) continue
      if (!shouldAutoCreateFromDisposition(metadata.finalDisposition)) continue
      for (const targetType of dualTargets(true)) {
        add({
          sourceType: "run_event",
          sourceId: event.id,
          targetType,
          failureCode: metadata.finalDisposition,
          payload: {
            runId,
            disposition: metadata.finalDisposition,
            metadata,
          },
          requestId: buildLearningRequestId("run_event", event.id, targetType),
        })
      }
    }
  }
}

function buildOutcomeDrafts(
  outcomes: LearningOutcomeInput[],
  add: CandidateSink,
) {
  for (const outcome of outcomes) {
    if (!shouldCreateFromVerdictCode(outcome.verdictCode)) continue
    const failed =
      outcome.verdictCode === "failed" || outcome.verdictCode === "ineffective"
    for (const targetType of dualTargets(failed)) {
      add({
        sourceType: "content_outcome",
        sourceId: outcome.id,
        projectId: outcome.projectId ?? undefined,
        generationId: outcome.generationId,
        targetType,
        failureCode: failed ? `outcome_${outcome.verdictCode}` : undefined,
        payload: {
          verdictCode: outcome.verdictCode,
          verdictNote: outcome.verdictNote,
          collectWindowDay: outcome.collectWindowDay,
        },
        requestId: buildLearningRequestId("content_outcome", outcome.id, targetType),
      })
    }
  }
}

export function buildLearningCandidateDrafts(input: {
  traces: LearningTraceInput[]
  events: LearningEventInput[]
  outcomes: LearningOutcomeInput[]
}): LearningCandidateDraft[] {
  const drafts: LearningCandidateDraft[] = []
  const seen = new Set<string>()
  const add = (draft: LearningCandidateDraft) =>
    pushUnique(drafts, seen, draft)
  const eventsByRun = groupEventsByRun(input.events)
  buildTraceDrafts(input.traces, eventsByRun, add)
  buildEventDrafts(eventsByRun, add)
  buildOutcomeDrafts(input.outcomes, add)
  return drafts
}

async function persistLearningDrafts(drafts: LearningCandidateDraft[]) {
  let created = 0
  for (const draft of drafts) {
    try {
      await prisma.learningCandidate.create({
        data: {
          ...draft,
          projectId: draft.projectId ?? null,
          generationId: draft.generationId ?? null,
          failureCode: draft.failureCode ?? null,
          reviewStatus: "pending",
          payload: JSON.parse(JSON.stringify(draft.payload)) as Prisma.InputJsonValue,
        },
      })
      created += 1
    } catch (error) {
      if (
        !error
        || typeof error !== "object"
        || !("code" in error)
        || (error as { code?: unknown }).code !== "P2002"
      ) throw error
    }
  }
  return { inspected: drafts.length, created, existing: drafts.length - created }
}

export async function captureLearningCandidates(input: {
  start: Date
  end: Date
}) {
  const traces = await prisma.aimExecutionTrace.findMany({
    where: { updatedAt: { gte: input.start, lt: input.end } },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: TRACE_LIMIT + 1,
    select: {
      id: true,
      runId: true,
      userId: true,
      projectId: true,
      aimGenerationId: true,
      status: true,
      durationMs: true,
      costCny: true,
      qualityStatus: true,
      errorMessage: true,
    },
  })
  if (traces.length > TRACE_LIMIT) throw new Error("Trace 超过 10000，请缩短周期")
  const runIds = traces.flatMap((trace) => trace.runId ? [trace.runId] : [])
  const [events, outcomes] = await Promise.all([
    prisma.aimRunEvent.findMany({
      where: {
        OR: [
          { createdAt: { gte: input.start, lt: input.end } },
          ...(runIds.length ? [{ runId: { in: runIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EVENT_LIMIT + 1,
      select: { id: true, runId: true, event: true, metadata: true, createdAt: true },
    }),
    prisma.contentOutcome.findMany({
      where: { updatedAt: { gte: input.start, lt: input.end } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: OUTCOME_LIMIT + 1,
      select: {
        id: true,
        projectId: true,
        generationId: true,
        verdictCode: true,
        verdictNote: true,
        collectWindowDay: true,
      },
    }),
  ])
  if (events.length > EVENT_LIMIT) throw new Error("运行事件超过 100000，请缩短周期")
  if (outcomes.length > OUTCOME_LIMIT) throw new Error("经营结果超过 10000，请缩短周期")
  return persistLearningDrafts(buildLearningCandidateDrafts({
    traces,
    events: events.filter((event) =>
      event.createdAt.getTime() >= input.start.getTime()
      && event.createdAt.getTime() < input.end.getTime()),
    outcomes,
  }))
}

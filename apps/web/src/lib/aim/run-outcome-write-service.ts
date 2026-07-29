import { prisma } from "@/lib/prisma"
import {
  buildAimRunEventMetadata,
  buildStructuredOutcomeColumns,
  isPrismaUniqueConstraintError,
  toPrismaJson,
  validateFinalDispositionEvent,
} from "@/lib/aim/aim-run-event-write"
import type {
  RunOutcomeChannel,
  RunOutcomeMetadata,
} from "@/lib/aim/run-outcome-telemetry"

export type RunOutcomeWriteResult =
  | { ok: true; id: string; deduped: boolean }
  | { ok: false; code: "RUN_NOT_FOUND" | "INVALID_OUTCOME"; error: string }

/** Persist one append-only terminal event using trace-derived cost and approved baseline data. */
export async function writeFinalRunOutcome(input: {
  runId: string
  userId: string
  channel: RunOutcomeChannel
  outcome: Omit<RunOutcomeMetadata, "channel" | "manualBaselineMinutes">
}): Promise<RunOutcomeWriteResult> {
  const trace = await prisma.aimExecutionTrace.findFirst({
    where: { runId: input.runId, userId: input.userId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      durationMs: true,
      totalTokens: true,
      costCny: true,
    },
  })
  if (!trace) {
    return { ok: false, code: "RUN_NOT_FOUND", error: "执行记录不存在" }
  }

  const baseline = await prisma.taskEfficiencyBaseline.findFirst({
    where: {
      workflowId: input.outcome.workflowId,
      taskType: input.outcome.taskType,
      validFrom: { lte: new Date() },
    },
    orderBy: { validFrom: "desc" },
    select: { medianManualMinutes: true },
  })
  const metadata = buildAimRunEventMetadata({
    bodyMetadata: {
      ...input.outcome,
      manualBaselineMinutes: baseline?.medianManualMinutes ?? null,
    },
    runId: input.runId,
    trace,
    expectedChannel: input.channel,
  })
  const validationError = validateFinalDispositionEvent("final_disposition", metadata)
  if (validationError) {
    return { ok: false, code: "INVALID_OUTCOME", error: validationError }
  }

  try {
    const created = await prisma.aimRunEvent.create({
      data: {
        runId: input.runId,
        userId: input.userId,
        event: "final_disposition",
        ...buildStructuredOutcomeColumns(metadata),
        metadata: toPrismaJson(metadata),
      },
      select: { id: true },
    })
    return { ok: true, id: created.id, deduped: false }
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error)) throw error
    const duplicate = await prisma.aimRunEvent.findUnique({
      where: {
        userId_runId_requestId: {
          userId: input.userId,
          runId: input.runId,
          requestId: input.outcome.requestId,
        },
      },
      select: { id: true },
    })
    if (!duplicate) throw error
    return { ok: true, id: duplicate.id, deduped: true }
  }
}

export async function findRunOutcomeOwner(runId: string) {
  return prisma.aimExecutionTrace.findFirst({
    where: { runId, userId: { not: null } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { userId: true, projectId: true },
  })
}

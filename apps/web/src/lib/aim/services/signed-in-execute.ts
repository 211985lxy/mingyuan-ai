/**
 * 网页统一入口（内容创作、选题策划、商业诊断）在鉴权之后走的那一段。
 * 页面接口和 MCP 都调这里。
 */

import type { AimExecuteBody } from "@/features/aim/contracts/api"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import { createAimTrace, failAimTrace, finishAimTrace, type AimTraceRecorder } from "@/lib/aim-observability"
import { loadIpProfileSeed } from "@/lib/aim/ip-profile-seed"
import { serializeAimGenerationRun } from "@/lib/aim/services/generate-request"
import { resolveAndTraceTurnGate, resolveUnderstandingWithDegradation } from "@/lib/aim/services/execute-turn"
import { executeVerifiedUnifiedDelivery, executeVerifiedUnifiedReply } from "@/lib/aim/services/unified-content-execution"
import {
  AimGenerationAttemptError,
  buildAimAttemptReplayResponse,
  completeAimGenerationAttempt,
  discardAimGenerationAttempt,
  failAimGenerationAttempt,
  markAimGenerationAwaitingInput,
  markAimGenerationRunning,
  startAimGenerationAttempt,
} from "@/lib/aim/generation-attempt"
import { AIM_EXECUTION_DEADLINE_MS, runWithAimExecutionDeadline } from "@/lib/llm/execution-deadline"
import { runWithActiveAimTrace } from "@/lib/aim/live-thinking"
import { toAimFailureResponse } from "@/lib/aim-error-message"

export interface SignedInExecuteAttempt {
  id: string
  userId: string
  projectId?: string
  created: boolean
}

export interface SignedInExecuteState {
  trace?: AimTraceRecorder
  attempt?: SignedInExecuteAttempt
}

export async function settleSignedInExecuteFailure(state: SignedInExecuteState, error: unknown) {
  if (!state.attempt || error instanceof AimGenerationAttemptError) return
  const failure = toAimFailureResponse(error, "mcp")
  await failAimGenerationAttempt({ ...state.attempt, error, code: failure.code }).catch(() => undefined)
  await failAimTrace(state.trace, error, { aimGenerationId: state.attempt.id })
}

export async function runSignedInAimExecute(input: {
  userId: string
  parsed: AimExecuteBody
  signal?: AbortSignal
  state: SignedInExecuteState
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const opened = await openSignedInExecuteAttempt(input.userId, input.parsed)
  input.state.attempt = opened.attempt
  if (opened.replay) return opened.replay
  return runWithAimExecutionDeadline(
    AIM_EXECUTION_DEADLINE_MS,
    () => runOpenedExecuteTurn({ ...opened, userId: input.userId, parsed: input.parsed, state: input.state }),
    input.signal,
  )
}

async function openSignedInExecuteAttempt(userId: string, parsed: AimExecuteBody) {
  const boundProject = await resolveBoundProject({ userId, requestedProjectId: parsed.projectId })
  const scopedParsed = { ...parsed, projectId: boundProject.id }
  const agentId = scopedParsed.executionAgentId || scopedParsed.agentId || "content_producer"
  assertRetryIdsMatch(scopedParsed.retryGenerationId, scopedParsed.attemptId)
  const started = await startAimGenerationAttempt({
    attemptId: scopedParsed.retryGenerationId || scopedParsed.attemptId,
    userId,
    projectId: boundProject.id,
    agentId,
    rawInput: scopedParsed.sourceEnvelope.currentUserRequest,
    targetFormats: scopedParsed.targetFormats,
    allowRetry: Boolean(scopedParsed.retryGenerationId),
  })
  const attempt: SignedInExecuteAttempt = {
    id: started.id,
    created: started.created,
    userId,
    projectId: boundProject.id,
  }
  const replayed = buildAimAttemptReplayResponse(started)
  return {
    attempt,
    scopedParsed,
    agentId,
    replay: replayed ? { status: replayed.status, body: replayed.body as Record<string, unknown> } : undefined,
  }
}

function assertRetryIdsMatch(retryGenerationId?: string, attemptId?: string) {
  if (retryGenerationId && attemptId && retryGenerationId !== attemptId) {
    throw new AimGenerationAttemptError("INVALID_REQUEST", "重试任务标识不一致")
  }
}

async function runOpenedExecuteTurn(input: {
  userId: string
  parsed: AimExecuteBody
  state: SignedInExecuteState
  attempt: SignedInExecuteAttempt
  scopedParsed: AimExecuteBody & { projectId: string }
  agentId: string
}): Promise<{ status: number; body: Record<string, unknown> }> {
  await markAimGenerationRunning(input.attempt)
  const trace = await createAimTrace({
    id: input.scopedParsed.traceId,
    userId: input.userId,
    projectId: input.scopedParsed.projectId,
    agentId: input.agentId,
    action: "generate",
    inputSummary: input.scopedParsed.sourceEnvelope.currentUserRequest,
  })
  input.state.trace = trace
  const profileSeed = await loadIpProfileSeed({ projectId: input.scopedParsed.projectId })
  const understanding = await resolveUnderstandingWithDegradation({
    envelope: input.scopedParsed.sourceEnvelope,
    agentId: input.agentId,
    trace,
    profileSeed,
  })
  const gate = await resolveAndTraceTurnGate({
    scopedParsed: input.scopedParsed,
    understanding,
    trace,
    profileSeed,
  })
  if (gate.clarification) return finishClarification(input.attempt, trace, gate.clarification)
  if (gate.intent.taskKind === "answer_question" || understanding.handling === "respond") {
    return finishReply(input, trace, understanding)
  }
  return finishDelivery(input, trace, understanding, gate.intent)
}

async function finishClarification(
  attempt: SignedInExecuteAttempt,
  trace: AimTraceRecorder | undefined,
  clarification: { question: string; questions: unknown },
) {
  await markAimGenerationAwaitingInput(attempt)
  await finishAimTrace(trace, { status: "success", outputSummary: "clarification", aimGenerationId: attempt.id })
  return {
    status: 200,
    body: {
      kind: "clarification",
      question: clarification.question,
      questions: clarification.questions,
      traceId: trace?.id,
      generationId: attempt.id,
    },
  }
}

async function finishReply(
  input: { userId: string; scopedParsed: AimExecuteBody; attempt: SignedInExecuteAttempt },
  trace: AimTraceRecorder | undefined,
  understanding: Awaited<ReturnType<typeof resolveUnderstandingWithDegradation>>,
) {
  const content = await runWithActiveAimTrace(trace?.id, () => executeVerifiedUnifiedReply({
    userId: input.userId,
    parsed: input.scopedParsed,
    understanding,
    trace,
  }))
  if (input.attempt.created) await discardAimGenerationAttempt(input.attempt)
  else await completeAimGenerationAttempt(input.attempt)
  await finishAimTrace(trace, { status: "success", outputSummary: "reply", aimGenerationId: input.attempt.id })
  return { status: 200, body: { kind: "reply", content, traceId: trace?.id } }
}

async function finishDelivery(
  input: { userId: string; scopedParsed: AimExecuteBody; attempt: SignedInExecuteAttempt },
  trace: AimTraceRecorder | undefined,
  understanding: Awaited<ReturnType<typeof resolveUnderstandingWithDegradation>>,
  intent: Awaited<ReturnType<typeof resolveAndTraceTurnGate>>["intent"],
) {
  const run = await runWithActiveAimTrace(trace?.id, () => executeVerifiedUnifiedDelivery({
    userId: input.userId,
    parsed: input.scopedParsed,
    understanding,
    intent,
    trace,
    generationAttemptId: input.attempt.id,
  }))
  await finishAimTrace(trace, { status: "success", aimGenerationId: input.attempt.id })
  const serialized = serializeAimGenerationRun(run)
  return {
    status: 200,
    body: {
      kind: "deliverable",
      ...serialized,
      runId: serialized.runId ?? run.metadata?.runId,
      traceId: run.traceId ?? trace?.id,
      generationId: input.attempt.id,
    },
  }
}

export function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return error instanceof AccountProjectContextError
    || (typeof error === "object" && error !== null
      && typeof (error as { code?: unknown }).code === "string"
      && typeof (error as { status?: unknown }).status === "number")
}

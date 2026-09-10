import {
  resolveAndTraceTurnGate,
  resolveUnderstandingWithDegradation,
} from "@/lib/aim/services/execute-turn"

import { NextRequest, NextResponse } from "next/server"

import { aimExecuteBodySchema } from "@/features/aim/contracts/api"
import { apiRequestErrorResponse, parseJsonRecord, ApiRequestError } from "@/lib/api-contract"
import { aimFailureHttpStatus, mapAimErrorToUserMessage, toAimFailureResponse, AimRunExecutionError } from "@/lib/aim-error-message"
import { AIM_GENERATE_MAX_REQUEST_BYTES } from "@/lib/aim/generate-payload-budget"
import { createAimTrace, failAimTrace, finishAimTrace, type AimTraceRecorder } from "@/lib/aim-observability"
import { executeVerifiedUnifiedDelivery, executeVerifiedUnifiedReply } from "@/lib/aim/services/unified-content-execution"
import { serializeAimGenerationRun } from "@/lib/aim/services/generate-request"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import { AIM_EXECUTION_DEADLINE_MS, runWithAimExecutionDeadline } from "@/lib/llm/execution-deadline"
import {
  AimGenerationAttemptError,
  completeAimGenerationAttempt,
  discardAimGenerationAttempt,
  failAimGenerationAttempt,
  markAimGenerationAwaitingInput,
  markAimGenerationRunning,
  startAimGenerationAttempt,
  buildAimAttemptReplayResponse,
} from "@/lib/aim/generation-attempt"

export const maxDuration = 180

type GenerationAttempt = { id: string; userId: string; projectId?: string; created: boolean }

/** 意图门解析 + resolve_user_intent trace 步骤（分歧/指令字符量可观测） */
export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  let attempt: GenerationAttempt | undefined
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_generate")
    if (quotaResponse) return quotaResponse
    const parsed = aimExecuteBodySchema.parse(await parseJsonRecord(request, {
      maxBytes: AIM_GENERATE_MAX_REQUEST_BYTES,
    }))
    const boundProject = await resolveBoundProject({
      userId: user.id,
      requestedProjectId: parsed.projectId,
    })
    const scopedParsed = { ...parsed, projectId: boundProject.id }
    const agentId = scopedParsed.executionAgentId || scopedParsed.agentId || "content_producer"
    if (
      scopedParsed.retryGenerationId
      && scopedParsed.attemptId
      && scopedParsed.retryGenerationId !== scopedParsed.attemptId
    ) {
      throw new AimGenerationAttemptError("INVALID_REQUEST", "重试任务标识不一致")
    }
    const attemptId = scopedParsed.retryGenerationId || scopedParsed.attemptId
    const started = await startAimGenerationAttempt({
      attemptId,
      userId: user.id,
      projectId: boundProject.id,
      agentId,
      rawInput: scopedParsed.sourceEnvelope.currentUserRequest,
      targetFormats: scopedParsed.targetFormats,
      allowRetry: Boolean(scopedParsed.retryGenerationId),
    })
    attempt = { id: started.id, created: started.created, userId: user.id, projectId: boundProject.id }
    const replayed = buildAimAttemptReplayResponse(started)
    if (replayed) return NextResponse.json(replayed.body, { status: replayed.status })
    return await runWithAimExecutionDeadline(AIM_EXECUTION_DEADLINE_MS, async () => {
      await markAimGenerationRunning(attempt!)
      trace = await createAimTrace({
        id: scopedParsed.traceId,
        userId: user.id,
        projectId: boundProject.id,
        agentId,
        action: "generate",
        inputSummary: scopedParsed.sourceEnvelope.currentUserRequest,
      })
      const understanding = await resolveUnderstandingWithDegradation({
        envelope: scopedParsed.sourceEnvelope,
        agentId,
        trace,
      })

      const gate = await resolveAndTraceTurnGate({
        scopedParsed,
        understanding,
        trace,
      })

      if (gate.clarification) {
        await markAimGenerationAwaitingInput(attempt!)
        await finishAimTrace(trace, { status: "success", outputSummary: "clarification", aimGenerationId: attempt!.id })
        return NextResponse.json({
          kind: "clarification",
          question: gate.clarification.question,
          questions: gate.clarification.questions,
          traceId: trace?.id,
          generationId: attempt!.id,
        })
      }
      if (gate.intent.taskKind === "answer_question" || understanding.handling === "respond") {
        const content = await executeVerifiedUnifiedReply({ userId: user.id, parsed: scopedParsed, understanding, trace })
        if (attempt!.created) await discardAimGenerationAttempt(attempt!)
        else await completeAimGenerationAttempt(attempt!)
        await finishAimTrace(trace, { status: "success", outputSummary: "reply", aimGenerationId: attempt!.id })
        return NextResponse.json({ kind: "reply", content, traceId: trace?.id })
      }
      const run = await executeVerifiedUnifiedDelivery({
        userId: user.id,
        parsed: scopedParsed,
        understanding,
        intent: gate.intent,
        trace,
        generationAttemptId: attempt!.id,
      })
      await finishAimTrace(trace, { status: "success", aimGenerationId: attempt!.id })
      const serialized = serializeAimGenerationRun(run)
      const runId = serialized.runId ?? run.metadata?.runId
      return NextResponse.json({
        kind: "deliverable",
        ...serialized,
        // runId 是 Harness 对外执行编号；traceId 仅用于实时思考面板与内部追踪。
        runId,
        traceId: run.traceId ?? trace?.id,
        generationId: attempt!.id,
      })
    }, request.signal)
  } catch (error) {
    // 失败必须留服务端痕迹：此前整条 catch 链零日志，生产排障只能看到
    // 「生成失败，请稍后重试」，无法定位是哪条线路、什么原因（2026-09-08 上午全量失败无迹可查）。
    const rawMessage = error instanceof Error ? error.message : String(error ?? "")
    const rootCause = error instanceof AimRunExecutionError && error.cause instanceof Error
      ? error.cause.message
      : rawMessage
    console.error(
      `[aim-execute] generation failed: code=${(error as { code?: string }).code ?? "UNKNOWN"}`
        + ` message=${JSON.stringify(rawMessage.slice(0, 300))}`
        + ` rootCause=${JSON.stringify(rootCause.slice(0, 300))}`,
    )
    if (error instanceof AimGenerationAttemptError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        generationId: error.generationId,
      }, { status: error.code === "GENERATION_IN_PROGRESS" ? 409 : 400 })
    }
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID()
    const failure = toAimFailureResponse(error, requestId)
    if (attempt) {
      await failAimGenerationAttempt({ ...attempt, error, code: failure.code }).catch(() => undefined)
      await failAimTrace(trace, error, { aimGenerationId: attempt.id })
      failure.generationId = attempt.id
      if (trace?.id) failure.traceId = trace.id
    }
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({
        ...failure,
        error: contextError.message,
        code: contextError.code,
        ...(attempt ? { generationId: attempt.id } : {}),
      }, { status: contextError.status })
    }
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse && !attempt) return contractResponse
    const contractError = error instanceof ApiRequestError ? error : undefined
    const message = error instanceof Error && error.message.includes("连续修正")
      ? error.message
      : mapAimErrorToUserMessage(error, failure.error)
    return NextResponse.json({
      ...failure,
      error: message,
      ...(contractResponse && error instanceof Error ? { field: (error as { field?: string }).field } : {}),
    }, {
      status: contractError?.status ?? aimFailureHttpStatus(failure.code),
      headers: { "x-request-id": requestId },
    })
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}

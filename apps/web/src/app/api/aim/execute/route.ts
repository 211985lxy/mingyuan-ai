import { NextRequest, NextResponse } from "next/server"

import { aimExecuteBodySchema } from "@/features/aim/contracts/api"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { aimFailureHttpStatus, mapAimErrorToUserMessage, toAimFailureResponse } from "@/lib/aim-error-message"
import { AIM_GENERATE_MAX_REQUEST_BYTES } from "@/lib/aim/generate-payload-budget"
import { createAimTrace, failAimTrace, finishAimTrace, addAimTraceStep, type AimTraceRecorder } from "@/lib/aim-observability"
import { understandAimContentTurnWithTrace } from "@/lib/aim/semantic-task-understanding"
import { MOUNTED_RULE_BLOCK_LABELS } from "@/lib/aim/mounted-rule-blocks"
import { resolveExecuteTurnGate } from "@/lib/aim/execute-turn-intent-gate"
import { executeVerifiedUnifiedDelivery, executeVerifiedUnifiedReply } from "@/lib/aim/services/unified-content-execution"
import { serializeAimGenerationRun } from "@/lib/aim/services/generate-request"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import {
  AimGenerationAttemptError,
  discardAimGenerationAttempt,
  failAimGenerationAttempt,
  markAimGenerationAwaitingInput,
  markAimGenerationRunning,
  startAimGenerationAttempt,
} from "@/lib/aim/generation-attempt"

export const maxDuration = 180

type GenerationAttempt = { id: string; userId: string; projectId?: string; created: boolean }

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
    const started = await startAimGenerationAttempt({
      attemptId: scopedParsed.attemptId,
      userId: user.id,
      projectId: boundProject.id,
      agentId,
      rawInput: scopedParsed.sourceEnvelope.currentUserRequest,
      targetFormats: scopedParsed.targetFormats,
    })
    attempt = { id: started.id, created: started.created, userId: user.id, projectId: boundProject.id }
    if (started.replay === "completed") {
      return NextResponse.json({
        kind: "deliverable",
        id: started.id,
        generationId: started.id,
        results: [],
        knowledgeUsed: [],
      })
    }
    if (started.replay === "failed") {
      return NextResponse.json({
        error: started.errorMessage || "生成失败",
        code: "INTERNAL_ERROR",
        generationId: started.id,
      }, { status: 500 })
    }
    await markAimGenerationRunning(attempt)
    trace = await createAimTrace({
      userId: user.id,
      projectId: boundProject.id,
      agentId,
      action: "generate",
      inputSummary: scopedParsed.sourceEnvelope.currentUserRequest,
    })
    const understanding = await understandAimContentTurnWithTrace({
      envelope: scopedParsed.sourceEnvelope,
      agentId,
      trace,
    })

    const gate = resolveExecuteTurnGate({
      envelope: scopedParsed.sourceEnvelope,
      handling: understanding.handling,
      llmQuestions: understanding.clarificationQuestions,
      formats: scopedParsed.targetFormats,
    })
    const mountedSummary = gate.mountedRuleBlocks.length
      ? `｜挂载 ${gate.mountedRuleBlocks.map((id) => MOUNTED_RULE_BLOCK_LABELS[id]).join("、")}`
      : ""
    await addAimTraceStep(trace, {
      key: "resolve_user_intent",
      label: "意图约束解析",
      status: "success",
      summary: `${gate.intent.taskKind}｜${gate.intent.isNewTask ? "新任务" : "延续任务"}｜缺口 ${gate.deterministicGaps.length} 项${mountedSummary}`,
      metadata: {
        taskKind: gate.intent.taskKind,
        isNewTask: gate.intent.isNewTask,
        lengthPolicy: gate.intent.lengthPolicy,
        constraintSources: gate.intent.constraintSources,
        gaps: gate.deterministicGaps.map((gap) => gap.field),
        mountedRuleBlocks: gate.mountedRuleBlocks,
      },
    })

    if (gate.clarification) {
      await markAimGenerationAwaitingInput(attempt)
      await finishAimTrace(trace, { status: "success", outputSummary: "clarification" })
      return NextResponse.json({
        kind: "clarification",
        question: gate.clarification.question,
        questions: gate.clarification.questions,
        runId: trace?.id,
        generationId: attempt.id,
      })
    }
    if (gate.intent.taskKind === "answer_question" || understanding.handling === "respond") {
      const content = await executeVerifiedUnifiedReply({ userId: user.id, parsed: scopedParsed, understanding, trace })
      await discardAimGenerationAttempt(attempt)
      await finishAimTrace(trace, { status: "success", outputSummary: "reply" })
      return NextResponse.json({ kind: "reply", content, runId: trace?.id })
    }
    const run = await executeVerifiedUnifiedDelivery({
      userId: user.id,
      parsed: scopedParsed,
      understanding,
      intent: gate.intent,
      trace,
      generationAttemptId: attempt.id,
    })
    await finishAimTrace(trace, { status: "success" })
    return NextResponse.json({
      kind: "deliverable",
      ...serializeAimGenerationRun(run),
      runId: trace?.id,
      generationId: attempt.id,
    })
  } catch (error) {
    if (error instanceof AimGenerationAttemptError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        generationId: error.generationId,
      }, { status: error.code === "GENERATION_IN_PROGRESS" ? 409 : 400 })
    }
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse
    if (attempt) await failAimGenerationAttempt({ ...attempt, error }).catch(() => undefined)
    await failAimTrace(trace, error)
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID()
    const failure = toAimFailureResponse(error, requestId)
    if (!failure.runId && trace?.id) failure.runId = trace.id
    const message = error instanceof Error && error.message.includes("连续修正")
      ? error.message
      : mapAimErrorToUserMessage(error, failure.error)
    return NextResponse.json({
      ...failure,
      error: message,
      generationId: attempt?.id,
    }, { status: aimFailureHttpStatus(failure.code) })
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}

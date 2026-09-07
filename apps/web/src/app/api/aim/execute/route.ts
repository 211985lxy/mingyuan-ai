import { NextRequest, NextResponse } from "next/server"

import { aimExecuteBodySchema } from "@/features/aim/contracts/api"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { mapAimErrorToUserMessage } from "@/lib/aim-error-message"
import { AIM_GENERATE_MAX_REQUEST_BYTES } from "@/lib/aim/generate-payload-budget"
import { createAimTrace, failAimTrace, addAimTraceStep, type AimTraceRecorder } from "@/lib/aim-observability"
import { understandAimContentTurnWithTrace } from "@/lib/aim/semantic-task-understanding"
import { MOUNTED_RULE_BLOCK_LABELS } from "@/lib/aim/mounted-rule-blocks"
import { resolveExecuteTurnGate } from "@/lib/aim/execute-turn-intent-gate"
import { executeVerifiedUnifiedDelivery, executeVerifiedUnifiedReply } from "@/lib/aim/services/unified-content-execution"
import { serializeAimGenerationRun } from "@/lib/aim/services/generate-request"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import {
  discardAimGenerationAttempt,
  failAimGenerationAttempt,
  startAimGenerationAttempt,
} from "@/lib/aim/generation-attempt"

export const maxDuration = 180

type GenerationAttempt = { id: string; userId: string; projectId?: string; created: boolean }

async function handleAimExecuteError(
  request: NextRequest,
  error: unknown,
  trace: AimTraceRecorder | undefined,
  attempt: GenerationAttempt | undefined,
) {
  if (attempt) await failAimGenerationAttempt({ ...attempt, error }).catch(() => undefined)
  const authResponse = authErrorResponse(error)
  if (authResponse) return authResponse
  const contractResponse = apiRequestErrorResponse(request, error)
  if (contractResponse) return contractResponse
  await failAimTrace(trace, error)
  const revisionFailed = error instanceof Error && error.message.includes("连续修正")
  const message = revisionFailed ? error.message : mapAimErrorToUserMessage(error, "生成失败，请稍后重试")
  return NextResponse.json({ error: message }, { status: revisionFailed ? 422 : 500 })
}

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
    const agentId = parsed.executionAgentId || parsed.agentId || "content_producer"
    const startedAttempt = await startAimGenerationAttempt({
      attemptId: parsed.attemptId, userId: user.id, projectId: parsed.projectId, agentId,
      rawInput: parsed.sourceEnvelope.currentUserRequest, targetFormats: parsed.targetFormats,
    })
    attempt = { ...startedAttempt, userId: user.id, projectId: parsed.projectId }
    trace = await createAimTrace({
      userId: user.id,
      projectId: parsed.projectId ?? null,
      agentId,
      action: "generate",
      inputSummary: parsed.sourceEnvelope.currentUserRequest,
    })
    const understanding = await understandAimContentTurnWithTrace({
      envelope: parsed.sourceEnvelope,
      agentId,
      trace,
    })

    // 意图门：意图解析 + 关键缺口 + 规则块挂载 + 追问组装（显性化，轨迹可见）
    const gate = resolveExecuteTurnGate({
      envelope: parsed.sourceEnvelope,
      handling: understanding.handling,
      llmQuestions: understanding.clarificationQuestions,
      formats: parsed.targetFormats,
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
      await discardAimGenerationAttempt(attempt)
      return NextResponse.json({
        kind: "clarification",
        question: gate.clarification.question,
        questions: gate.clarification.questions,
        runId: trace?.id,
      })
    }
    if (understanding.handling === "respond") {
      const content = await executeVerifiedUnifiedReply({ userId: user.id, parsed, understanding, trace })
      await discardAimGenerationAttempt(attempt)
      return NextResponse.json({ kind: "reply", content, runId: trace?.id })
    }
    const run = await executeVerifiedUnifiedDelivery({
      userId: user.id,
      parsed,
      understanding,
      trace,
      generationAttemptId: attempt.id,
    })
    return NextResponse.json({ kind: "deliverable", ...serializeAimGenerationRun(run) })
  } catch (error) {
    return handleAimExecuteError(request, error, trace, attempt)
  }
}

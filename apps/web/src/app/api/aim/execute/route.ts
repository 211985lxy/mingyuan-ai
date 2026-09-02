import { NextRequest, NextResponse } from "next/server"

import { aimExecuteBodySchema } from "@/features/aim/contracts/api"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { mapAimErrorToUserMessage } from "@/lib/aim-error-message"
import { AIM_GENERATE_MAX_REQUEST_BYTES } from "@/lib/aim/generate-payload-budget"
import { createAimTrace, failAimTrace, addAimTraceStep, type AimTraceRecorder } from "@/lib/aim-observability"
import { understandAimContentTurnWithTrace } from "@/lib/aim/semantic-task-understanding"
import {
  buildNumberedClarification,
  collectIntentClarificationGaps,
  isClarificationAnswerTurn,
  mergeClarificationQuestions,
  resolveUserIntentFromEnvelope,
  type IntentClarificationGap,
} from "@/lib/aim/resolved-user-intent"
import { executeVerifiedUnifiedDelivery, executeVerifiedUnifiedReply } from "@/lib/aim/services/unified-content-execution"
import { serializeAimGenerationRun } from "@/lib/aim/services/generate-request"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"

export const maxDuration = 180

export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_generate")
    if (quotaResponse) return quotaResponse
    const parsed = aimExecuteBodySchema.parse(await parseJsonRecord(request, {
      maxBytes: AIM_GENERATE_MAX_REQUEST_BYTES,
    }))
    const agentId = parsed.executionAgentId || parsed.agentId || "content_producer"
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

    // 确定性意图解析 + 按任务类型的关键缺口检查（与 LLM 理解互补）。
    // 用户正在回答上一轮追问时不再追加确定性追问，避免重复问已确认字段。
    const intent = resolveUserIntentFromEnvelope(parsed.sourceEnvelope, parsed.targetFormats)
    const deterministicGaps = isClarificationAnswerTurn(parsed.sourceEnvelope)
      ? []
      : collectIntentClarificationGaps(intent)
    await addAimTraceStep(trace, {
      key: "resolve_user_intent",
      label: "意图约束解析",
      status: "success",
      summary: `${intent.taskKind}｜${intent.isNewTask ? "新任务" : "延续任务"}｜缺口 ${deterministicGaps.length} 项`,
      metadata: {
        taskKind: intent.taskKind,
        isNewTask: intent.isNewTask,
        lengthPolicy: intent.lengthPolicy,
        constraintSources: intent.constraintSources,
        gaps: deterministicGaps.map((gap) => gap.field),
      },
    })

    let gapsToAsk: IntentClarificationGap[] = []
    if (understanding.handling === "clarify") {
      gapsToAsk = mergeClarificationQuestions(understanding.clarificationQuestions ?? [], deterministicGaps)
    } else if (understanding.handling === "deliver" && deterministicGaps.length > 0) {
      // 用户指令唯一真源：关键缺口未确认不先生成，也不用隐藏默认值顶替
      gapsToAsk = deterministicGaps
    }
    const clarificationText = gapsToAsk.length ? buildNumberedClarification(gapsToAsk) : undefined
    if (clarificationText) {
      return NextResponse.json({
        kind: "clarification",
        question: clarificationText,
        questions: gapsToAsk.map((gap) => gap.question),
        runId: trace?.id,
      })
    }
    if (understanding.handling === "respond") {
      const content = await executeVerifiedUnifiedReply({ userId: user.id, parsed, understanding, trace })
      return NextResponse.json({ kind: "reply", content, runId: trace?.id })
    }
    const run = await executeVerifiedUnifiedDelivery({ userId: user.id, parsed, understanding, trace })
    return NextResponse.json({ kind: "deliverable", ...serializeAimGenerationRun(run) })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse
    await failAimTrace(trace, error)
    const message = error instanceof Error && error.message.includes("连续修正")
      ? error.message
      : mapAimErrorToUserMessage(error, "生成失败，请稍后重试")
    return NextResponse.json({ error: message }, { status: error instanceof Error && error.message.includes("连续修正") ? 422 : 500 })
  }
}

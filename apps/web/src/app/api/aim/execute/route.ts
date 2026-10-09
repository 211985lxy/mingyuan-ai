import { NextRequest, NextResponse } from "next/server"

import { aimExecuteBodySchema } from "@/features/aim/contracts/api"
import { apiRequestErrorResponse, parseJsonRecord, ApiRequestError } from "@/lib/api-contract"
import { aimFailureHttpStatus, mapAimErrorToUserMessage, toAimFailureResponse, AimRunExecutionError } from "@/lib/aim-error-message"
import { AIM_GENERATE_MAX_REQUEST_BYTES } from "@/lib/aim/generate-payload-budget"
import { failAimTrace } from "@/lib/aim-observability"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { AccountProjectContextError } from "@/lib/account-project-context"
import { AimGenerationAttemptError, failAimGenerationAttempt } from "@/lib/aim/generation-attempt"
import {
  isAccountProjectContextError,
  runSignedInAimExecute,
  type SignedInExecuteState,
} from "@/lib/aim/services/signed-in-execute"

export const maxDuration = 180

/** 意图门解析 + resolve_user_intent trace 步骤（分歧/指令字符量可观测） */
export async function POST(request: NextRequest) {
  const state: SignedInExecuteState = {}
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_generate")
    if (quotaResponse) return quotaResponse
    const parsed = aimExecuteBodySchema.parse(await parseJsonRecord(request, {
      maxBytes: AIM_GENERATE_MAX_REQUEST_BYTES,
    }))
    const result = await runSignedInAimExecute({
      userId: user.id,
      parsed,
      signal: request.signal,
      state,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return respondToExecuteFailure(request, state, error)
  }
}

async function respondToExecuteFailure(request: NextRequest, state: SignedInExecuteState, error: unknown) {
  logExecuteFailure(error)
  if (error instanceof AimGenerationAttemptError) {
    return NextResponse.json({
      error: error.message,
      code: error.code,
      generationId: error.generationId,
    }, { status: error.code === "GENERATION_IN_PROGRESS" ? 409 : 400 })
  }
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID()
  const failure = toAimFailureResponse(error, requestId)
  const attempt = state.attempt
  const trace = state.trace
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

function logExecuteFailure(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "")
  const rootCause = error instanceof AimRunExecutionError && error.cause instanceof Error
    ? error.cause.message
    : rawMessage
  console.error(
    `[aim-execute] generation failed: code=${(error as { code?: string }).code ?? "UNKNOWN"}`
      + ` message=${JSON.stringify(rawMessage.slice(0, 300))}`
      + ` rootCause=${JSON.stringify(rootCause.slice(0, 300))}`,
  )
}

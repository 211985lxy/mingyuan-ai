/**
 * 网页「开始生成」在鉴权之后走的那一段。
 * 页面接口和 MCP 都调这里，避免各写一套。
 */

import type { AimTraceRecorder } from "@/lib/aim-observability"
import { runWithActiveAimTrace } from "@/lib/aim/live-thinking"
import {
  executePreparedAimGeneration,
  prepareAimGenerateRequest,
  recordAimGenerationQuality,
  serializeAimGenerationRun,
} from "@/lib/aim/services/generate-request"

export interface SignedInGenerateState {
  trace?: AimTraceRecorder
}

export async function runSignedInAimGenerate(input: {
  userId: string
  body: Record<string, unknown>
  state?: SignedInGenerateState
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const prepared = await prepareAimGenerateRequest(input.userId, input.body)
  if (input.state) input.state.trace = prepared.trace
  if (!prepared.ok) {
    return {
      status: prepared.status ?? 400,
      body: {
        error: prepared.validationError,
        ...(prepared.errorCode ? { code: prepared.errorCode } : {}),
      },
    }
  }
  const run = await runWithActiveAimTrace(prepared.trace?.id, () => executePreparedAimGeneration(prepared))
  await recordAimGenerationQuality(prepared.trace, run)
  return { status: 200, body: serializeAimGenerationRun(run) }
}

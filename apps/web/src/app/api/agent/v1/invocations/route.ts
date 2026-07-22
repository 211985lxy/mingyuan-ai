import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import { agentAuthErrorResponse, authenticateAgentRequest, assertAgentScope } from "@/lib/agent-api-auth"
import { isRemoteInvocationsEnabled } from "@/lib/aim-remote/feature-flags"
import { submitInvocation } from "@/lib/aim-remote/invocation-service"
import {
  AGENT_SCOPE,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MAX_INSTRUCTION_CHARS,
  MAX_RAW_INPUT_CHARS,
  MAX_TARGET_FORMATS,
  MIN_IDEMPOTENCY_KEY_LENGTH,
  MIN_TARGET_FORMATS,
  REMOTE_ERROR_CODE,
  remoteErrorStatus,
} from "@/lib/aim-remote/contracts"

const submitSchema = z.object({
  idempotencyKey: z.string().trim().min(MIN_IDEMPOTENCY_KEY_LENGTH).max(MAX_IDEMPOTENCY_KEY_LENGTH),
  projectId: z.string().trim().min(1).max(80),
  agentId: z.string().trim().min(1).max(60),
  rawInput: z.string().min(1).max(MAX_RAW_INPUT_CHARS),
  targetFormats: z.array(z.string()).min(MIN_TARGET_FORMATS).max(MAX_TARGET_FORMATS),
  instruction: z.string().max(MAX_INSTRUCTION_CHARS).optional(),
  topicTitle: z.string().max(500).optional(),
  topicRationale: z.string().max(2000).optional(),
}).strict()

/**
 * @description 处理 POST 请求 — 异步提交一次草稿生成调用
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  if (!isRemoteInvocationsEnabled()) {
    return NextResponse.json({ error: "Remote invocations are disabled", code: REMOTE_ERROR_CODE.REMOTE_FEATURE_DISABLED }, { status: 503 })
  }
  try {
    const context = await authenticateAgentRequest(request)
    assertAgentScope(context, AGENT_SCOPE.draftsSubmit)
    const body = await parseJsonBody(request, submitSchema, { maxBytes: 64 * 1024 })

    const result = await submitInvocation(context, {
      idempotencyKey: body.idempotencyKey,
      projectId: body.projectId,
      agentId: body.agentId as never,
      rawInput: body.rawInput,
      targetFormats: body.targetFormats as never,
      instruction: body.instruction,
      topicTitle: body.topicTitle,
      topicRationale: body.topicRationale,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.errorMessage, code: result.errorCode }, { status: remoteErrorStatus(result.errorCode) })
    }
    return NextResponse.json(result.response, { status: result.created ? 202 : 200 })
  } catch (error) {
    return agentAuthErrorResponse(error)
      ?? NextResponse.json({ error: "Invocation submission failed" }, { status: 500 })
  }
}

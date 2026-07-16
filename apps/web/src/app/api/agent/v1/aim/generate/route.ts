import { NextRequest, NextResponse } from "next/server"

import {
  assertAgentAccess,
  assertAgentProjectAccess,
  agentAuthErrorResponse,
  authenticateAgentRequest,
} from "@/lib/agent-api-auth"
import { findInvalidAgentTargetFormats } from "@/lib/agent-api-contract"
import { executeAimRun, normalizeAimAgentId } from "@/lib/aim-harness/runtime"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { createAimTrace } from "@/lib/aim-observability"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import {
  buildAgentGenerateResponse,
  finalizeAgentGenerateRun,
  formatInvalidFormatsError,
  logAgentGenerateFailure,
  parseAgentGenerateBody,
  prepareAgentAimGeneration,
  validateAgentGenerateBody,
} from "@/lib/aim/services/agent-generation"

export async function POST(request: NextRequest) {
  let context = null as null | Awaited<ReturnType<typeof authenticateAgentRequest>>
  let projectId = ""
  let agentId = ""
  let inputSummary = ""
  let outputFormats: string[] = []
  const startedAt = Date.now()

  try {
    context = await authenticateAgentRequest(request)
    const body = await parseJsonRecord(request)

    const parsed = parseAgentGenerateBody(body)
    const invalidFormats = findInvalidAgentTargetFormats(body.targetFormats)
    projectId = parsed.projectId
    agentId = parsed.agentId
    inputSummary = parsed.inputSummary
    outputFormats = parsed.targetFormats

    const validationError = validateAgentGenerateBody(parsed)
    if (validationError) throw new Error(validationError)
    if (invalidFormats.length > 0) throw new Error(formatInvalidFormatsError(invalidFormats))

    // access 断言顺序不可变：project 先于 agent（assertAgentAccess 用原始 agentId）
    assertAgentProjectAccess(context, projectId)
    assertAgentAccess(context, agentId)

    // 归一化旧别名（ip_video → content_producer），保证写入 DB / 日志 / 响应的 id 一致
    const { agentId: normalizedAgentId, runRequest, buildDomainInput } =
      prepareAgentAimGeneration({ parsed, normalizeAgentId: normalizeAimAgentId, userId: context.userId })
    agentId = normalizedAgentId

    const trace = await createAimTrace({
      userId: context.userId,
      projectId,
      agentId,
      action: "generate",
      inputSummary,
    })

    const run = await executeAimRun(runRequest, (spec) =>
      executeAimGenerationDomain(spec, buildDomainInput(trace)),
    )
    const result = run.output

    const createdAt = await finalizeAgentGenerateRun({
      context,
      projectId,
      agentId,
      inputSummary,
      outputFormats: parsed.targetFormats,
      generationId: result.id,
      startedAt,
    })

    return buildAgentGenerateResponse({
      result,
      agentId,
      projectId,
      run,
      createdAt,
    })
  } catch (error) {
    await logAgentGenerateFailure({ context, projectId, agentId, inputSummary, outputFormats, error, startedAt })

    console.error("[agent/aim/generate] Error:", error)
    const authResponse = agentAuthErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成失败" },
      { status: 400 }
    )
  }
}

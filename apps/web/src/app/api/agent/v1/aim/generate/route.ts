import { NextRequest, NextResponse } from "next/server"

import {
  assertAgentAccess,
  assertAgentProjectAccess,
  assertAgentScope,
  agentAuthErrorResponse,
  authenticateAgentRequest,
} from "@/lib/agent-api-auth"
import { executeAimRun, normalizeAimAgentId } from "@/lib/aim-harness/runtime"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { createAimTrace } from "@/lib/aim-observability"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { AIM_GENERATE_MAX_REQUEST_BYTES } from "@/lib/aim/generate-payload-budget"
import { AGENT_SCOPE } from "@/lib/aim-remote/contracts"
import {
  buildAgentGenerateResponse,
  finalizeAgentGenerateRun,
  logAgentGenerateFailure,
  prepareAgentAimGeneration,
  prepareAgentGenerateBody,
} from "@/lib/aim/services/agent-generation"

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  let context = null as null | Awaited<ReturnType<typeof authenticateAgentRequest>>
  let projectId = ""
  let agentId = ""
  let inputSummary = ""
  let outputFormats: string[] = []
  const startedAt = Date.now()

  try {
    context = await authenticateAgentRequest(request)
    assertAgentScope(context, AGENT_SCOPE.draftsSubmit)
    const body = await parseJsonRecord(request, { maxBytes: AIM_GENERATE_MAX_REQUEST_BYTES })

    const prepared = prepareAgentGenerateBody(body)
    if (!prepared.ok) throw new Error(prepared.validationError)
    projectId = prepared.projectId
    agentId = prepared.agentId
    inputSummary = prepared.inputSummary
    outputFormats = prepared.targetFormats

    // access 断言顺序不可变：project 先于 agent（assertAgentAccess 用原始 agentId）
    await assertAgentProjectAccess(context, projectId)
    assertAgentAccess(context, agentId)

    // 归一化旧别名（ip_video → content_producer），保证写入 DB / 日志 / 响应的 id 一致
    const { agentId: normalizedAgentId, runRequest, buildDomainInput } =
      prepareAgentAimGeneration({ parsed: prepared, normalizeAgentId: normalizeAimAgentId, userId: context.userId })
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
      outputFormats: prepared.targetFormats,
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

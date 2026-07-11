import { NextRequest, NextResponse } from "next/server"

import {
  AGENT_DENIED_ACTIONS,
  findInvalidAgentTargetFormats,
  parseAgentTargetFormats,
  summarizeAgentInput,
} from "@/lib/agent-api-contract"
import {
  agentAuthErrorResponse,
  assertAgentAccess,
  assertAgentProjectAccess,
  authenticateAgentRequest,
  type AgentApiContext,
} from "@/lib/agent-api-auth"
import { prisma } from "@/lib/prisma"
import { executeAimRun, normalizeAimAgentId } from "@/lib/aim-harness/runtime"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { createAimTrace } from "@/lib/aim-observability"

async function writeAgentLog(params: {
  context: AgentApiContext
  projectId?: string
  agentId?: string
  inputSummary?: string
  outputFormats?: string[]
  status: "success" | "failed"
  errorMessage?: string
  durationMs?: number
  aimGenerationId?: string
}) {
  await prisma.agentApiCallLog.create({
    data: {
      apiKeyId: params.context.apiKeyId,
      userId: params.context.userId,
      projectId: params.projectId || null,
      agentId: params.agentId || null,
      action: "aim.generate",
      inputSummary: params.inputSummary || null,
      outputFormats: params.outputFormats || [],
      status: params.status,
      errorMessage: params.errorMessage || null,
      durationMs: params.durationMs || null,
      aimGenerationId: params.aimGenerationId || null,
    },
  })
}

export async function POST(request: NextRequest) {
  let context: AgentApiContext | null = null
  let projectId = ""
  let agentId = ""
  let inputSummary = ""
  let outputFormats: string[] = []
  const startedAt = Date.now()

  try {
    context = await authenticateAgentRequest(request)
    const body = await request.json()

    const rawInput = typeof body.rawInput === "string" ? body.rawInput.trim() : ""
    projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    agentId = typeof body.agentId === "string" ? body.agentId.trim() : ""
    const invalidFormats = findInvalidAgentTargetFormats(body.targetFormats)
    const targetFormats = parseAgentTargetFormats(body.targetFormats)
    inputSummary = summarizeAgentInput(rawInput)
    outputFormats = targetFormats

    if (!rawInput) {
      throw new Error("请输入内容")
    }
    if (!projectId) {
      throw new Error("请选择 IP 营销全案")
    }
    if (targetFormats.length === 0) {
      throw new Error("请选择至少一种生成格式")
    }
    if (invalidFormats.length > 0) {
      throw new Error(`不支持的生成格式：${invalidFormats.join(", ")}`)
    }

    assertAgentProjectAccess(context, projectId)
    assertAgentAccess(context, agentId)

    // 归一化旧别名（ip_video → content_producer），保证写入 DB / 日志 / 响应的 id 一致
    agentId = normalizeAimAgentId(agentId)

    const userId = context.userId
    const trace = await createAimTrace({
      userId,
      projectId,
      agentId,
      action: "generate",
      inputSummary,
    })

    const run = await executeAimRun({
      entrypoint: "agent_api",
      rawInput,
      agentId,
      targetFormats,
      polishInstruction: typeof body.instruction === "string" ? body.instruction : undefined,
      topicTitle: typeof body.topicTitle === "string" ? body.topicTitle : undefined,
      topicRationale: typeof body.topicRationale === "string" ? body.topicRationale : undefined,
      actorId: userId,
      projectId,
      trace,
      runLlmQuality: false,
    }, (spec) => executeAimGenerationDomain(spec, {
          userId,
          projectId,
          rawInput,
          targetFormats,
          topicTitle: typeof body.topicTitle === "string" ? body.topicTitle : undefined,
          topicRationale: typeof body.topicRationale === "string" ? body.topicRationale : undefined,
          polishInstruction: typeof body.instruction === "string" ? body.instruction : undefined,
          trace,
        }))

    const result = run.output

    const created = await prisma.aimGeneration.findUnique({
      where: { id: result.id },
      select: { createdAt: true },
    })

    await prisma.agentApiKey.update({
      where: { id: context.apiKeyId },
      data: { lastUsedAt: new Date() },
    })

    await writeAgentLog({
      context,
      projectId,
      agentId,
      inputSummary,
      outputFormats: targetFormats,
      status: "success",
      durationMs: Date.now() - startedAt,
      aimGenerationId: result.id,
    })

    return NextResponse.json({
      id: result.id,
      agentId,
      projectId,
      results: result.results,
      createdAt: created?.createdAt.toISOString() || new Date().toISOString(),
      warnings: ["draft_only"],
      deniedActions: AGENT_DENIED_ACTIONS,
      // Additive harness diagnostics (Phase 4): do not alter existing fields.
      runId: run.metadata.runId,
      degraded: run.metadata.degraded,
      provider: run.metadata.provider,
      model: run.metadata.model,
      qualityStatus: run.qualityStatus,
    })
  } catch (error) {
    if (context) {
      await writeAgentLog({
        context,
        projectId,
        agentId,
        inputSummary,
        outputFormats,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "生成失败",
        durationMs: Date.now() - startedAt,
      })
    }

    console.error("[agent/aim/generate] Error:", error)
    const authResponse = agentAuthErrorResponse(error)
    if (authResponse) return authResponse

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成失败" },
      { status: 400 }
    )
  }
}

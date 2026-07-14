import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"

import {
  agentAuthErrorResponse,
  assertAgentProjectAccess,
  authenticateAgentRequest,
  type AgentApiContext,
} from "@/lib/agent-api-auth"
import { processChunksForSmartImport } from "@/lib/knowledge-auto-processor"
import { prisma } from "@/lib/prisma"
import { agentWechatImportBodySchema } from "@/features/aim/contracts/agent-api"

const MAX_WECHAT_CHAT_CHARS = 50_000

async function writeAgentLog(params: {
  context: AgentApiContext
  projectId?: string
  inputSummary?: string
  status: "success" | "failed"
  errorMessage?: string
  durationMs?: number
}) {
  await prisma.agentApiCallLog.create({
    data: {
      apiKeyId: params.context.apiKeyId,
      userId: params.context.userId,
      projectId: params.projectId || null,
      action: "knowledge.wechat_chat.import.preview",
      inputSummary: params.inputSummary || null,
      outputFormats: [],
      status: params.status,
      errorMessage: params.errorMessage || null,
      durationMs: params.durationMs || null,
    },
  })
}

export async function POST(request: NextRequest) {
  let context: AgentApiContext | null = null
  let projectId = ""
  let rawText = ""
  const startedAt = Date.now()

  try {
    context = await authenticateAgentRequest(request)
    const body = await parseJsonBody(request, agentWechatImportBodySchema, { maxBytes: 64 * 1024 })

    projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    rawText = typeof body.rawText === "string" ? body.rawText.trim() : ""

    if (!projectId) {
      throw new Error("请选择 IP 营销全案")
    }
    if (!rawText) {
      throw new Error("请提供微信聊天导出文本")
    }
    if (rawText.length > MAX_WECHAT_CHAT_CHARS) {
      throw new Error(`微信聊天导出文本不能超过 ${MAX_WECHAT_CHAT_CHARS} 字`)
    }

    await assertAgentProjectAccess(context, projectId)

    const processed = await processChunksForSmartImport({
      // ponytail: 微信聊天 skill 先支持直接贴文本，后续真有需要再补文件上传版本。
      chunks: [rawText],
      fileName: "wechat-chat.txt",
      userId: context.userId,
      projectId,
    })

    await prisma.agentApiKey.update({
      where: { id: context.apiKeyId },
      data: { lastUsedAt: new Date() },
    })

    await writeAgentLog({
      context,
      projectId,
      inputSummary: rawText.slice(0, 500),
      status: "success",
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json({
      projectId,
      processed,
      warnings: ["preview_only", "knowledge_mutation_requires_confirm"],
    })
  } catch (error) {
    if (context) {
      await writeAgentLog({
        context,
        projectId,
        inputSummary: rawText.slice(0, 500),
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "导入预览失败",
        durationMs: Date.now() - startedAt,
      })
    }

    console.error("[agent/knowledge/wechat-chat/import] Error:", error)
    const authResponse = agentAuthErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入预览失败" },
      { status: 400 },
    )
  }
}

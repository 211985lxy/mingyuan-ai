import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import {
  addAimTraceStep,
  createAimTrace,
  failAimTrace,
  finishAimTrace,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { executeAimRun, streamAimRun } from "@/lib/aim-harness/runtime"
import { executeAimChatDomain } from "@/lib/aim-harness/domain-executor"
import {
  assembleAimChatContext,
  buildAimChatJsonResponse,
  buildAimChatStreamResponse,
  extractTextContent,
  handleToolActionBranch,
  parseAimChatBody,
  prepareAimChatExecution,
} from "@/lib/aim/services/chat-context"

export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_chat")
    if (quotaResponse) return quotaResponse

    const { messages, agentId, projectId, toolAction, resultId, shouldStream, editorContext } =
      parseAimChatBody(await parseJsonRecord(request))

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "请求格式不正确，缺少 messages 数组" }, { status: 400 })
    }
    trace = await createAimTrace({
      userId: user.id,
      projectId: projectId || null,
      agentId: agentId || null,
      action: toolAction ? "tool_action" : "chat",
      inputSummary: extractTextContent((messages[messages.length - 1] as { content?: unknown })?.content),
    })
    await addAimTraceStep(trace, {
      key: "route_request",
      label: "路由请求识别",
      status: "success",
      summary: toolAction ? "工具动作" : "普通聊天",
      metadata: { agentId, projectId: projectId || null, stream: shouldStream, messageCount: messages.length },
    })

    // ── 飞书工具动作（委托给共享模块）──
    if (toolAction) {
      return handleToolActionBranch({ trace, toolAction, userId: user.id, projectId, resultId })
    }

    // ── 普通聊天：统一知识上下文 + Harness 执行（入口直连 executeAimRun/streamAimRun）──
    const context = await assembleAimChatContext({
      userId: user.id,
      projectId,
      agentId,
      messages,
      editorContext,
      trace,
    })
    const exec = prepareAimChatExecution({
      context,
      userId: user.id,
      projectId,
      agentId,
      shouldStream,
      trace,
    })
    await addAimTraceStep(trace, exec.summaryStep)

    if (shouldStream) {
      const streamRun = await streamAimRun(exec.streamRequest)
      exec.persistMemory()
      return buildAimChatStreamResponse(streamRun, exec.chatParams, trace)
    }

    const chatRun = await executeAimRun(
      exec.runRequest,
      (spec) => executeAimChatDomain(spec, exec.chatParams, context.contextManifest),
    )
    await finishAimTrace(trace, { outputSummary: summarizeText(chatRun.output) })
    exec.persistMemory()

    return buildAimChatJsonResponse(chatRun)
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse

    console.error("[aim/chat] Error:", error)
    await failAimTrace(trace, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "对话失败，请稍后重试" },
      { status: 500 }
    )
  }
}

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
import { ownsActiveProject } from "@/lib/resource-ownership"
import { resolveAimExecutionAgent } from "@/lib/aim/services/aim-execution-agent"

/** 流式对话可能较长；与 Nginx /api proxy_read_timeout(300s) 对齐 */
export const maxDuration = 180
const AIM_CHAT_MAX_REQUEST_BYTES = 128 * 1024

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_chat")
    if (quotaResponse) return quotaResponse

    const parsed = parseAimChatBody(await parseJsonRecord(request, {
      maxBytes: AIM_CHAT_MAX_REQUEST_BYTES,
    }))
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.validationError }, { status: parsed.status })
    }
    const { messages, agentId, projectId, toolAction, resultId, shouldStream, editorContext, agentModule, writerModule, traceId, methodologyProfileIds, activeMethodologySignals } = parsed

    if (projectId && !(await ownsActiveProject(user.id, projectId))) {
      return NextResponse.json({ error: "IP 营销全案不存在或已归档" }, { status: 404 })
    }

    // 技能跨引擎委托：只换本轮执行引擎，trace / 记忆仍挂在会话智能体名下。
    const execAgent = resolveAimExecutionAgent({
      sessionAgentId: agentId,
      requestedExecutionAgentId: parsed.requestedExecutionAgentId,
    })

    trace = await createAimTrace({
      id: traceId || undefined,
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
      metadata: {
        agentId,
        executionAgentId: execAgent.executionAgentId,
        delegatedExecution: execAgent.delegated,
        // 非法引擎字段不静默丢弃：留痕后回落到会话智能体
        rejectedExecutionAgentId: execAgent.rejectedExecutionAgentId ?? null,
        projectId: projectId || null,
        stream: shouldStream,
        messageCount: messages.length,
      },
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
      executionAgentId: execAgent.executionAgentId,
      messages,
      editorContext,
      trace,
      methodologyProfileIds,
      activeMethodologySignals,
      // resultId 在飞书导出里就是 AimGeneration id；复盘同语义，缺省不猜
      targetGenerationId: resultId || undefined,
    })
    const exec = prepareAimChatExecution({
      context,
      userId: user.id,
      projectId,
      agentId,
      executionAgentId: execAgent.executionAgentId,
      agentModule,
      writerModule,
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

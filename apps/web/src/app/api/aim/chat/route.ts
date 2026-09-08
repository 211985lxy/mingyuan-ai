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
import { mapAimErrorToUserMessage } from "@/lib/aim-error-message"
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
import {
  AccountProjectContextError,
  resolveBoundProject,
} from "@/lib/account-project-context"
import { resolveAimExecutionAgent } from "@/lib/aim/services/aim-execution-agent"
import { evaluateHitlGate, settleHitlApproval } from "@/lib/aim/hitl-gate"

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
    const { messages, agentId, projectId: requestedProjectId, toolAction, resultId, shouldStream, editorContext, agentModule, writerModule, traceId, methodologyProfileIds, activeMethodologySignals, hitlDecision } = parsed
    let projectId: string
    try {
      projectId = (await resolveBoundProject({
        userId: user.id,
        requestedProjectId,
      })).id
    } catch (error) {
      if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
        const contextError = error as { message: string; code: string; status: number }
        return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
      }
      throw error
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
      // Step③ HITL：对外发送/写知识库先落人工决策，批准才放行（开关默认关，关闭时零介入）
      if (hitlDecision) {
        const settle = await settleHitlApproval({
          userId: user.id,
          projectId,
          toolAction,
          resultId: resultId || undefined,
          decision: hitlDecision,
        })
        if (!settle.proceed) {
          await finishAimTrace(trace, { outputSummary: "HITL 驳回，未执行" })
          return NextResponse.json({ content: "已按你的指令驳回该操作，未执行。" })
        }
      }
      const gate = await evaluateHitlGate({
        userId: user.id,
        projectId,
        toolAction,
        resultId: resultId || undefined,
      })
      if (gate.gated && gate.approval.status === "pending") {
        await addAimTraceStep(trace, {
          key: "hitl_gate",
          label: "高风险动作人工审批",
          status: "success",
          summary: gate.approval.label,
          metadata: { toolAction, approvalRequestId: gate.approval.approvalRequestId },
        })
        await finishAimTrace(trace, { outputSummary: "等待人工审批" })
        return NextResponse.json({ approvalRequired: gate.approval })
      }
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
      { error: mapAimErrorToUserMessage(error, "对话失败，请稍后重试") },
      { status: 500 }
    )
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}

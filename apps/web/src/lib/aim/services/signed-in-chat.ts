/**
 * 网页输入框「发送」在认人之后走的那一段。
 * 页面接口和 MCP 都调这里。MCP 不传写飞书的动作。
 */

import { NextResponse } from "next/server"
import {
  addAimTraceStep,
  createAimTrace,
  finishAimTrace,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { executeAimChatDomain } from "@/lib/aim-harness/domain-executor"
import { executeAimRun, streamAimRun } from "@/lib/aim-harness/runtime"
import { resolveBoundProject } from "@/lib/account-project-context"
import { notifyHitlApprovalRequired } from "@/lib/aim/feishu-hitl-notify"
import { evaluateHitlGate, settleHitlApproval } from "@/lib/aim/hitl-gate"
import { resolveAimExecutionAgent } from "@/lib/aim/services/aim-execution-agent"
import {
  assembleAimChatContext,
  buildAimChatJsonResponse,
  buildAimChatStreamResponse,
  extractTextContent,
  handleToolActionBranch,
  parseAimChatBody,
  prepareAimChatExecution,
  type AimChatRequestBody,
} from "@/lib/aim/services/chat-context"

export interface SignedInChatState {
  trace?: AimTraceRecorder
}

type OpenedChat = {
  userId: string
  parsed: AimChatRequestBody
  projectId: string
  trace: AimTraceRecorder | undefined
  executionAgentId: string
}

export async function runSignedInAimChat(input: {
  userId: string
  body: unknown
  state?: SignedInChatState
}): Promise<Response> {
  const parsed = parseAimChatBody(input.body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.validationError }, { status: parsed.status })
  }
  const project = await openChatProject(input.userId, parsed.projectId)
  if (!project.ok) return project.response
  const opened = await openChatTrace(input.userId, parsed, project.projectId, input.state)
  if (parsed.toolAction) return runChatToolAction(opened)
  return runChatConversation(opened)
}

async function openChatProject(userId: string, requestedProjectId: string) {
  try {
    const project = await resolveBoundProject({ userId, requestedProjectId })
    return { ok: true as const, projectId: project.id }
  } catch (error) {
    if (!isProjectContextError(error)) throw error
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message, code: error.code }, { status: error.status }),
    }
  }
}

async function openChatTrace(
  userId: string,
  parsed: AimChatRequestBody,
  projectId: string,
  state?: SignedInChatState,
): Promise<OpenedChat> {
  const execAgent = resolveAimExecutionAgent({
    sessionAgentId: parsed.agentId,
    requestedExecutionAgentId: parsed.requestedExecutionAgentId,
  })
  const trace = await createAimTrace({
    id: parsed.traceId || undefined,
    userId,
    projectId: projectId || null,
    agentId: parsed.agentId || null,
    action: parsed.toolAction ? "tool_action" : "chat",
    inputSummary: extractTextContent((parsed.messages[parsed.messages.length - 1] as { content?: unknown })?.content),
  })
  if (state) state.trace = trace
  await addAimTraceStep(trace, {
    key: "route_request",
    label: "路由请求识别",
    status: "success",
    summary: parsed.toolAction ? "工具动作" : "普通聊天",
    metadata: {
      agentId: parsed.agentId,
      executionAgentId: execAgent.executionAgentId,
      delegatedExecution: execAgent.delegated,
      rejectedExecutionAgentId: execAgent.rejectedExecutionAgentId ?? null,
      projectId: projectId || null,
      stream: parsed.shouldStream,
      messageCount: parsed.messages.length,
    },
  })
  return { userId, parsed, projectId, trace, executionAgentId: execAgent.executionAgentId }
}

async function runChatToolAction(opened: OpenedChat) {
  const { parsed, userId, projectId, trace } = opened
  if (parsed.hitlDecision) {
    const settle = await settleHitlApproval({
      userId,
      projectId,
      toolAction: parsed.toolAction,
      resultId: parsed.resultId || undefined,
      decision: parsed.hitlDecision,
    })
    if (!settle.proceed) {
      await finishAimTrace(trace, { outputSummary: "HITL 驳回，未执行" })
      return NextResponse.json({ content: "已按你的指令驳回该操作，未执行。" })
    }
  }
  const gate = await evaluateHitlGate({
    userId,
    projectId,
    toolAction: parsed.toolAction,
    resultId: parsed.resultId || undefined,
  })
  if (gate.gated && gate.approval.status === "pending") {
    await addAimTraceStep(trace, {
      key: "hitl_gate",
      label: "高风险动作人工审批",
      status: "success",
      summary: gate.approval.label,
      metadata: { toolAction: parsed.toolAction, approvalRequestId: gate.approval.approvalRequestId },
    })
    await finishAimTrace(trace, { outputSummary: "等待人工审批" })
    notifyHitlApprovalRequired(gate.approval, { projectId })
    return NextResponse.json({ approvalRequired: gate.approval })
  }
  return handleToolActionBranch({
    trace,
    toolAction: parsed.toolAction,
    userId,
    projectId,
    resultId: parsed.resultId,
  })
}

async function runChatConversation(opened: OpenedChat) {
  const { parsed, userId, projectId, trace, executionAgentId } = opened
  const context = await assembleAimChatContext({
    userId,
    projectId,
    agentId: parsed.agentId,
    executionAgentId,
    messages: parsed.messages,
    editorContext: parsed.editorContext,
    trace,
    methodologyProfileIds: parsed.methodologyProfileIds,
    activeMethodologySignals: parsed.activeMethodologySignals,
    targetGenerationId: parsed.resultId || undefined,
  })
  const exec = prepareAimChatExecution({
    context,
    userId,
    projectId,
    agentId: parsed.agentId,
    executionAgentId,
    agentModule: parsed.agentModule,
    writerModule: parsed.writerModule,
    shouldStream: parsed.shouldStream,
    trace,
  })
  await addAimTraceStep(trace, exec.summaryStep)
  if (parsed.shouldStream) {
    const streamRun = await streamAimRun(exec.streamRequest)
    exec.persistMemory()
    return buildAimChatStreamResponse(streamRun, exec.chatParams, trace, context.feishuSources)
  }
  const chatRun = await executeAimRun(
    exec.runRequest,
    (spec) => executeAimChatDomain(spec, exec.chatParams, context.contextManifest),
  )
  await finishAimTrace(trace, { outputSummary: summarizeText(chatRun.output) })
  exec.persistMemory()
  return buildAimChatJsonResponse({ ...chatRun, feishuSources: context.feishuSources })
}

function isProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { message?: unknown }).message === "string"
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}

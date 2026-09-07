"use client"

import { toast } from "sonner"

import { buildGenerationSourceEnvelope } from "@/hooks/aim-generation-source-envelope"
import type { AimGenerationActionInput } from "@/hooks/use-aim-generation-actions"
import { mergeAimGenerationIntoMessages } from "@/lib/aim/merge-aim-generation-messages"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import {
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  findLatestAimDeliverableId,
} from "@/lib/aim/workbench-helpers"
import { startRunOutcomeActivity } from "@/lib/aim/run-outcome-client"
import { buildWebAttemptId } from "@/lib/aim/unified-execute-entry"
import { mapAimErrorToUserMessage, type AimFailureCode } from "@/lib/aim-error-message"
import { ApiError, type AimExecuteResponse, type AimGenerateResponse } from "@/lib/api/client"

/**
 * 统一执行入口的请求构建与响应应用（从 use-aim-generation-actions 拆出，
 * 保持单向依赖：hook → 本模块；本模块只以类型引用 hook 的输入结构）。
 */

export function resolveFollowUpGenerationId(
  startsNewTask: boolean | undefined,
  messages: AimWorkbenchMessage[],
): string | undefined {
  if (startsNewTask) return undefined
  return findLatestAimDeliverableId(messages)
}

/** 澄清回答必须复用原任务；普通成稿后续改写仍创建新的 attempt。 */
export function resolvePendingGenerationAttemptId(
  startsNewTask: boolean | undefined,
  messages: AimWorkbenchMessage[],
): string | undefined {
  if (startsNewTask) return undefined
  return [...messages].reverse().find((message) =>
    message.generationStatus === "awaiting_input" && message.generationId,
  )?.generationId ?? undefined
}

const REUSABLE_ATTEMPT_ID = /^web_[a-f0-9]{24}$/

/** 解析本轮可复用的生成任务 ID：澄清回答复用原任务，重试复用失败任务，否则新建 web_ 编号。 */
export function resolveGenerationAttemptId(params: {
  options: { retryMessageId?: string; retryGenerationId?: string; attemptId?: string }
  /** 发送前的完整消息列表：awaiting 标记与失败卡片都要从这里取回任务 ID。 */
  messages: AimWorkbenchMessage[]
  baseMessages: AimWorkbenchMessage[]
  startsNewTask: boolean | undefined
  traceId: string
}) {
  const retrySource = params.options.retryMessageId
    ? params.messages.find((message) => message.id === params.options.retryMessageId)
    : undefined
  const requestedRetryGenerationId = params.options.retryGenerationId
    || retrySource?.failure?.generationId
    || retrySource?.generationId
  const retryGenerationId = requestedRetryGenerationId && REUSABLE_ATTEMPT_ID.test(requestedRetryGenerationId)
    ? requestedRetryGenerationId
    : undefined
  const attemptId = params.options.attemptId && REUSABLE_ATTEMPT_ID.test(params.options.attemptId)
    ? params.options.attemptId
    : retryGenerationId
    // appendPendingGeneration 会清掉旧气泡的 awaiting 标记；这里必须从发送前的
    // 原消息列表取任务 ID，否则澄清回答会被误建成一条新任务。
    || resolvePendingGenerationAttemptId(params.startsNewTask || params.baseMessages.length === 0, params.messages)
    || buildWebAttemptId(params.traceId)
  return { attemptId, retryGenerationId, retrySource }
}

/** 生成失败的用户可见反馈：错误码映射、失败卡片与历史刷新（从 use-aim-generation-actions 拆出）。 */
export function applyGenerationFailure(
  input: AimGenerationActionInput,
  params: {
    assistantMessageId: string
    currentInput: string
    error: unknown
    traceId: string
    generationAttemptId?: string
  },
) {
  const { assistantMessageId, currentInput, error, traceId } = params
  const message = mapAimErrorToUserMessage(error, "生成失败，请稍后重试")
  const details = error instanceof ApiError && detailsRecord(error.details) ? detailsRecord(error.details) : null
  const failureCode = typeof details?.code === "string"
    ? details.code as AimFailureCode
    : undefined
  const failureGenerationId = typeof details?.generationId === "string" ? details.generationId : params.generationAttemptId
  const failureRunId = typeof details?.runId === "string" ? details.runId : undefined
  const failureTraceId = typeof details?.traceId === "string" ? details.traceId : traceId
  toast.error(message)
  input.setMessages((messages) => messages.map((item) => item.id === assistantMessageId
    ? {
        ...item,
        content: message,
        regenerating: false,
        pendingGeneration: false,
        failure: {
          kind: "generate" as const,
          retryText: currentInput,
          code: failureCode,
          generationId: failureGenerationId,
          runId: failureRunId,
          recoverable: typeof details?.recoverable === "boolean"
            ? details.recoverable
            : !(failureCode === "PROVIDER_AUTH" || failureCode === "INVALID_REQUEST" || failureCode === "BOUND_PROJECT_UNAVAILABLE" || failureCode === "INTERNAL_ERROR"),
        },
        generationId: failureGenerationId ?? item.generationId,
        runId: failureRunId ?? item.runId,
        traceId: failureTraceId ?? item.traceId,
      }
    : item))
  void input.refreshHistory({ force: true })
}

function detailsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export interface AimExecuteTurnRequestOptions {
  startsNewTask?: boolean
  executionAgentId?: string
  retryOfRunId?: string
  attemptId?: string
  retryGenerationId?: string
  traceId?: string
  /** 方法论类技能一次性透传：本轮触发对应方法论/爆款结构注入 */
  activeMethodologySignals?: import("@/lib/aim-agent-guides").AimMethodologySignal[]
}

/** 统一执行入口请求体：只带统一入口所需字段；意图/约束/上下文全部由 sourceEnvelope 提供 */
export function buildExecuteTurnRequest(
  input: AimGenerationActionInput,
  rawInput: string,
  currentInput: string,
  baseMessages: AimWorkbenchMessage[],
  options: AimExecuteTurnRequestOptions,
) {
  const existingGenerationId = resolveFollowUpGenerationId(
    options.startsNewTask || baseMessages.length === 0,
    baseMessages,
  )
  const sourceEnvelope = buildGenerationSourceEnvelope({
    currentUserRequest: currentInput || rawInput,
    messages: baseMessages,
    editorText: input.editorText,
    editorFormat: input.editorFormat,
    existingGenerationId,
    sourceOriginalText: input.sourceOriginalText,
    sourceAnalysisText: input.sourceAnalysisText,
  })
  return {
    agentId: input.selectedAgentId,
    executionAgentId: options.executionAgentId,
    projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
    sourceEnvelope,
    targetFormats: input.agent.defaultFormats,
    // 方法论是当前控件偏好，不是上一任务正文；新任务仍可带上用户已选卡片
    methodologyProfileIds: input.selectedMethodologyProfileIds?.length ? input.selectedMethodologyProfileIds : undefined,
    activeMethodologySignals: options.activeMethodologySignals?.length ? options.activeMethodologySignals : undefined,
    retryOfRunId: options.retryOfRunId,
    attemptId: options.attemptId,
    retryGenerationId: options.retryGenerationId,
    traceId: options.traceId,
  }
}

function getDeliverableReadyMessage(agentTitle: string) {
  return `${agentTitle} 交付物已生成，可直接复制使用，也能继续在下方对话里让我改写。`
}

export function applyGenerationResponse(
  input: AimGenerationActionInput,
  assistantMessageId: string,
  currentInput: string,
  response: AimGenerateResponse,
) {
  startRunOutcomeActivity(response.runId)
  const originalText = extractBenchmarkOriginalText(currentInput)
  const analysisText = extractBenchmarkAnalysisText(currentInput)
  if (originalText) input.setSourceOriginalText(originalText)
  if (analysisText) input.setSourceAnalysisText(analysisText)
  input.setMessages((messages) => mergeAimGenerationIntoMessages(messages, assistantMessageId, {
    content: getDeliverableReadyMessage(input.agent.title),
    agentId: input.agent.id,
    deliverables: response,
    generationId: response.id,
    runId: response.runId ?? null,
    traceId: response.traceId ?? null,
    degraded: response.degraded ?? null,
    qualityStatus: response.qualityStatus ?? null,
    workflowStage: input.currentWorkflowStage,
    contentAction: input.contentAction,
    regenerating: false,
    failure: null,
  }))
  const mainResult = response.results[0]
  if (mainResult) input.openEditorFromResult(assistantMessageId, mainResult.format, mainResult.content)
  void input.refreshHistory({ force: true })
  if (input.selectedProjectId) void input.refreshProjectWorkflow()
  input.setWorkflowBrief(null)
  input.setContentAction(null)
  toast.success(`${input.agent.primaryActionLabel}完毕`)
}

export function applyExecuteTurnResponse(
  input: AimGenerationActionInput,
  assistantMessageId: string,
  response: AimExecuteResponse,
  currentInput: string,
) {
  // 追问：保持任务上下文不清理，用户按编号回答后重发即带着完整对话
  if (response.kind === "clarification") {
    input.setMessages((messages) => messages.map((item) => item.id === assistantMessageId
      ? {
          ...item,
          content: response.question,
          pendingGeneration: false,
          failure: null,
          generationId: response.generationId ?? item.generationId,
          generationStatus: "awaiting_input",
          traceId: response.traceId ?? item.traceId,
        }
      : item))
    void input.refreshHistory({ force: true })
    return
  }
  if (response.kind === "reply") {
    input.setMessages((messages) => messages.map((item) => item.id === assistantMessageId
      ? { ...item, content: response.content, pendingGeneration: false, failure: null, traceId: response.traceId ?? item.traceId }
      : item))
    return
  }
  applyGenerationResponse(input, assistantMessageId, currentInput, response)
}

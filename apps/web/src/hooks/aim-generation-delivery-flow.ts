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
import type { AimExecuteResponse, AimGenerateResponse } from "@/lib/api/client"

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

export interface AimExecuteTurnRequestOptions {
  startsNewTask?: boolean
  executionAgentId?: string
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
    runId: response.runId ?? null,
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
      ? { ...item, content: response.question, pendingGeneration: false, failure: null }
      : item))
    return
  }
  if (response.kind === "reply") {
    input.setMessages((messages) => messages.map((item) => item.id === assistantMessageId
      ? { ...item, content: response.content, pendingGeneration: false, failure: null }
      : item))
    return
  }
  applyGenerationResponse(input, assistantMessageId, currentInput, response)
}

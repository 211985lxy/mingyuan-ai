"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"

import { ApiError } from "@/lib/api/client"
import type { AimEditorContext, TextSelectionRange } from "@/lib/aim-editor"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { CopyStudioModule } from "@/lib/copy-studio"
import { shouldIsolateWritingInstruction, detectAimWorkbenchCommand, type AimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import { buildAimChatMessages, runAimChatRequest } from "@/lib/aim/chat-request"
import {
  detectAimLarkToolAction,
  findLatestAimDeliverableId,
  prepareAimChatTurn,
  reportAimChatRevision,
} from "@/lib/aim/workbench-helpers"
import type { AimImageAttachment, AimWorkbenchMessage } from "@/lib/aim/workbench-types"

export interface SendAimTextOptions {
  editorContext?: AimEditorContext
  editorApplyRange?: TextSelectionRange
  images?: AimImageAttachment[]
  retryMessageId?: string
}

interface AimChatActionInput {
  messages: AimWorkbenchMessage[]
  setMessages: Dispatch<SetStateAction<AimWorkbenchMessage[]>>
  setInput: Dispatch<SetStateAction<string>>
  setIsThinking: Dispatch<SetStateAction<boolean>>
  selectedAgentId: AimAgentId
  selectedProjectId: string
  projectEnabled: boolean
  requestAbortRef: MutableRefObject<AbortController | null>
  clearCurrentTaskContext: () => void
  clearImages: () => void
  runWorkbenchCommand: (command: AimWorkbenchCommand) => boolean | void
  agentModule?: CopyStudioModule
}

function setAssistantMessage(input: AimChatActionInput, assistantId: string, content: string) {
  input.setMessages((messages) => messages.map((message) => message.id === assistantId ? { ...message, content } : message))
}

async function executeChatRequest(
  input: AimChatActionInput,
  text: string,
  options: SendAimTextOptions,
  controller: AbortController,
  assistantId: string,
  thread: AimWorkbenchMessage[],
  traceId: string,
) {
  const toolAction = detectAimLarkToolAction(text)
  if (toolAction && input.projectEnabled && !input.selectedProjectId) {
    setAssistantMessage(input, assistantId, "需要先选择 IP 营销全案，才能执行这个飞书同步动作。")
    return
  }
  const resultId = toolAction === "export_lark_generation" ? findLatestAimDeliverableId(input.messages) : undefined
  if (toolAction === "export_lark_generation" && !resultId) {
    setAssistantMessage(input, assistantId, "当前没有可同步到飞书的 AIM 生成结果。")
    return
  }
  const { hasContent } = await runAimChatRequest({
    messages: buildAimChatMessages(thread),
    agentId: input.selectedAgentId,
    projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
    toolAction,
    resultId,
    editorContext: options.editorContext,
    agentModule: input.agentModule,
    writerModule: input.agentModule,
    signal: controller.signal,
    traceId,
    onContent: (content) => setAssistantMessage(input, assistantId, content),
  })
  if (!hasContent) {
    input.setMessages((messages) => messages.map((message) => message.id === assistantId
      ? { ...message, content: "没有收到模型回复。", failure: { kind: "chat", retryText: text } }
      : message))
  }
}

async function sendAimText(input: AimChatActionInput, text: string, options: SendAimTextOptions = {}) {
  const images = options.images ?? []
  if (!text && images.length === 0) return
  const startsNewTask = !options.retryMessageId && shouldIsolateWritingInstruction(text, input.messages.length > 0)
  const command = detectAimWorkbenchCommand(text)
  if (!startsNewTask && command && input.runWorkbenchCommand(command)) return
  reportAimChatRevision(input.messages, options.retryMessageId, startsNewTask)
  const controller = new AbortController()
  input.requestAbortRef.current = controller
  const turn = prepareAimChatTurn({ messages: input.messages, text, images, retryMessageId: options.retryMessageId, startsNewTask, editorApplyRange: options.editorApplyRange })
  const traceId = crypto.randomUUID()
  if (startsNewTask) input.clearCurrentTaskContext()
  input.setMessages(turn.pendingMessages)
  input.setMessages((messages) => messages.map((message) => message.id === turn.assistantId
    ? { ...message, traceId, traceType: "chat" as const }
    : message))
  input.setInput("")
  if (images.length) input.clearImages()
  input.setIsThinking(true)
  try {
    await executeChatRequest(input, text, { ...options, editorContext: startsNewTask ? undefined : options.editorContext }, controller, turn.assistantId, turn.thread, traceId)
  } catch (error) {
    const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
    const content = stopped ? "已停止本次回复。" : `对话失败：${error instanceof Error ? error.message : "请稍后重试"}`
    input.setMessages((messages) => messages.map((message) => message.id === turn.assistantId
      ? { ...message, content, failure: stopped ? null : { kind: "chat", retryText: text } }
      : message))
  } finally {
    if (input.requestAbortRef.current === controller) input.requestAbortRef.current = null
    input.setIsThinking(false)
  }
}

/**
 * @description React Hook：aimchatactions
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimChatActions(input: AimChatActionInput) {
  return { sendText: (text: string, options?: SendAimTextOptions) => sendAimText(input, text, options) }
}

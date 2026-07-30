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
  formatAimMessageContentForModel,
  prepareAimChatTurn,
  reportAimChatRevision,
} from "@/lib/aim/workbench-helpers"
import type { AimImageAttachment, AimWorkbenchMessage } from "@/lib/aim/workbench-types"

export interface SendAimTextOptions {
  editorContext?: AimEditorContext
  editorApplyRange?: TextSelectionRange
  images?: AimImageAttachment[]
  retryMessageId?: string
  /** 本轮委托执行引擎；与会话 agentId 平级，缺省则不委托 */
  executionAgentId?: string
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
  /** 软隔离新任务：清流程 brief / URL 任务态等。 */
  onIsolateTaskSession?: () => void
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
  // 复盘要读这条内容的真实发布数据，目标只取当前会话里的交付物；
  // 会话里没有交付物时留空，让服务端走「未登记」而不是猜一条内容。
  const retroTargetId = (options.executionAgentId ?? input.selectedAgentId) === "content_retro"
    ? findLatestAimDeliverableId(input.messages)
    : undefined
  const { hasContent } = await runAimChatRequest({
    messages: buildAimChatMessages(thread.map((message) => ({
      role: message.role,
      content: formatAimMessageContentForModel(message),
      images: message.images,
    }))),
    agentId: input.selectedAgentId,
    projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
    toolAction,
    resultId: resultId ?? retroTargetId,
    editorContext: options.editorContext,
    agentModule: input.agentModule,
    writerModule: input.agentModule,
    signal: controller.signal,
    traceId,
    ...(options.executionAgentId ? { executionAgentId: options.executionAgentId } : {}),
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
  // 与生成链路共用 requestAbortRef：启动前中止旧请求，避免 busy 被旧 finally 误清
  input.requestAbortRef.current?.abort()
  const controller = new AbortController()
  input.requestAbortRef.current = controller
  const turn = prepareAimChatTurn({ messages: input.messages, text, images, retryMessageId: options.retryMessageId, startsNewTask, editorApplyRange: options.editorApplyRange })
  const traceId = crypto.randomUUID()
  if (startsNewTask) {
    input.clearCurrentTaskContext()
    input.onIsolateTaskSession?.()
  }
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
    if (input.requestAbortRef.current === controller) {
      input.requestAbortRef.current = null
      input.setIsThinking(false)
    }
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

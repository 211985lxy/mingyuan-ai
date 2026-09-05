"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"

import { ApiError } from "@/lib/api/client"
import { mapAimErrorToUserMessage } from "@/lib/aim-error-message"
import type { AimEditorContext, TextSelectionRange } from "@/lib/aim-editor"
import { agentAllowsThinkingProcess } from "@/lib/aim/agent-capabilities"
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
import type { AimImageAttachment, AimFileAttachment, AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import { appendAimFileAttachmentsToContent } from "@/lib/aim/file-attachments"
import { persistContentRetroAfterChat } from "@/lib/aim/persist-content-retro"
import { toast } from "sonner"

export interface SendAimTextOptions {
  editorContext?: AimEditorContext
  editorApplyRange?: TextSelectionRange
  images?: AimImageAttachment[]
  files?: AimFileAttachment[]
  retryMessageId?: string
  /** 本轮委托执行引擎；与会话 agentId 平级，缺省则不委托 */
  executionAgentId?: string
  /** 复盘目标内容 AimGeneration id；缺省时回落到会话最新交付物 */
  resultId?: string
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
  clearFiles: () => void
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
  traceId?: string,
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
  // 复盘要读这条内容的真实发布数据：显式指定优先，否则取当前会话交付物；
  // 都没有时留空，让服务端走「未登记」而不是猜一条内容。
  const retroTargetId = (options.executionAgentId ?? input.selectedAgentId) === "content_retro"
    ? (options.resultId?.trim() || findLatestAimDeliverableId(input.messages) || undefined)
    : undefined
  let latestContent = ""
  const { hasContent } = await runAimChatRequest({
    messages: buildAimChatMessages(thread.map((message) => ({
      role: message.role,
      content: appendAimFileAttachmentsToContent(formatAimMessageContentForModel(message), message.files),
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
    ...(traceId ? { traceId } : {}),
    ...(options.executionAgentId ? { executionAgentId: options.executionAgentId } : {}),
    onContent: (content) => {
      latestContent = content
      setAssistantMessage(input, assistantId, content)
    },
  })
  if (!hasContent) {
    input.setMessages((messages) => messages.map((message) => message.id === assistantId
      ? { ...message, content: "没有收到模型回复。", failure: { kind: "chat", retryText: text } }
      : message))
    return
  }

  const isRetroTurn = (options.executionAgentId ?? input.selectedAgentId) === "content_retro"
  if (isRetroTurn && latestContent.trim() && retroTargetId) {
    try {
      const persisted = await persistContentRetroAfterChat({
        projectId: input.projectEnabled ? input.selectedProjectId : null,
        generationId: retroTargetId,
        retroBody: latestContent,
        source: /【发布数据原文】/.test(text) ? "paste" : "chat",
      })
      if (persisted.savedKnowledge) {
        toast.success("复盘结论已沉淀到知识库")
      } else if (persisted.warning) {
        toast.message(persisted.warning)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复盘沉淀失败")
    }
  }
}

async function sendAimText(input: AimChatActionInput, text: string, options: SendAimTextOptions = {}) {
  const images = options.images ?? []
  const files = options.files ?? []
  if (!text && images.length === 0 && files.length === 0) return
  const startsNewTask = !options.retryMessageId && shouldIsolateWritingInstruction(text, input.messages.length > 0)
  const command = detectAimWorkbenchCommand(text)
  if (!startsNewTask && command && input.runWorkbenchCommand(command)) return
  reportAimChatRevision(input.messages, options.retryMessageId, startsNewTask)
  // 与生成链路共用 requestAbortRef：启动前中止旧请求，避免 busy 被旧 finally 误清
  input.requestAbortRef.current?.abort()
  const controller = new AbortController()
  input.requestAbortRef.current = controller
  const turn = prepareAimChatTurn({ messages: input.messages, text, images, files, retryMessageId: options.retryMessageId, startsNewTask, editorApplyRange: options.editorApplyRange })
  // 作品编辑等不展示思考过程的专家：不挂 trace，避免空转 SSE 拖住观感
  const executionAgent = options.executionAgentId ?? input.selectedAgentId
  const attachTrace = agentAllowsThinkingProcess(executionAgent)
  const traceId = attachTrace ? crypto.randomUUID() : undefined
  if (startsNewTask) {
    input.clearCurrentTaskContext()
    input.onIsolateTaskSession?.()
  }
  input.setMessages(turn.pendingMessages)
  if (traceId) {
    input.setMessages((messages) => messages.map((message) => message.id === turn.assistantId
      ? { ...message, traceId, traceType: "chat" as const }
      : message))
  }
  input.setInput("")
  if (images.length) input.clearImages()
  if (files.length) input.clearFiles()
  input.setIsThinking(true)
  try {
    await executeChatRequest(input, text, { ...options, editorContext: startsNewTask ? undefined : options.editorContext }, controller, turn.assistantId, turn.thread, traceId)
  } catch (error) {
    const timedOut = error instanceof ApiError && error.status === 408
    const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
    const content = stopped && !timedOut
      ? "已停止本次回复。"
      : mapAimErrorToUserMessage(error, "对话失败，请稍后重试")
    input.setMessages((messages) => messages.map((message) => message.id === turn.assistantId
      ? { ...message, content, failure: stopped && !timedOut ? null : { kind: "chat", retryText: text } }
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

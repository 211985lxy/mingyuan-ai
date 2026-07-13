"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"

import { chatAim, chatAimStream, ApiError, recordAimRunEvent } from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type {
  AimImageAttachment,
  ChatMessage,
} from "@/features/aim/aim-workbench-types"
import { nextAimMessageId } from "@/features/aim/aim-id"
import {
  buildChatContent,
  detectLarkToolAction,
  getLatestDeliverableId,
} from "@/features/aim/aim-command-utils"
import type { AimEditorContext, TextSelectionRange } from "@/lib/aim-editor"
import type { AimWorkbenchCommand } from "@/lib/aim-workbench-commands"

interface SendTextOptions {
  editorContext?: AimEditorContext
  editorApplyRange?: TextSelectionRange
  images?: AimImageAttachment[]
  retryMessageId?: string
}

interface UseAimChatActionsOptions {
  selectedAgentId: AimAgentId
  selectedProjectId: string
  projectEnabled: boolean
  messages: ChatMessage[]
  requestAbortRef: MutableRefObject<AbortController | null>
  runWorkbenchCommand: (command: AimWorkbenchCommand) => boolean
  detectWorkbenchCommand: (text: string) => AimWorkbenchCommand | null
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setInput: Dispatch<SetStateAction<string>>
  setImageAttachments: Dispatch<SetStateAction<AimImageAttachment[]>>
  setIsThinking: Dispatch<SetStateAction<boolean>>
}

function reportAimRunEvent(
  runId: string | null | undefined,
  event: "copied" | "revised" | "accepted",
  metadata?: Record<string, unknown>,
) {
  if (!runId) return
  void recordAimRunEvent(runId, event, metadata).catch(() => undefined)
}

export function useAimChatActions({
  selectedAgentId,
  selectedProjectId,
  projectEnabled,
  messages,
  requestAbortRef,
  runWorkbenchCommand,
  detectWorkbenchCommand,
  setMessages,
  setInput,
  setImageAttachments,
  setIsThinking,
}: UseAimChatActionsOptions) {
  async function sendText(text: string, options?: SendTextOptions) {
    const images = options?.images ?? []
    if (!text && images.length === 0) return
    const workbenchCommand = detectWorkbenchCommand(text)
    if (workbenchCommand && runWorkbenchCommand(workbenchCommand)) return
    if (!options?.retryMessageId) {
      const revisedRun = [...messages].reverse().find((message) => message.deliverables && message.runId)?.runId
      reportAimRunEvent(revisedRun, "revised", { channel: "chat" })
    }
    const controller = new AbortController()
    requestAbortRef.current = controller
    const baseMessages = options?.retryMessageId
      ? messages.filter((message) => message.id !== options.retryMessageId)
      : messages
    const userMsg: ChatMessage = { id: nextAimMessageId(), role: "user", content: text || "请分析这张图片。", images }
    const thread = options?.retryMessageId ? baseMessages : [...baseMessages, userMsg]
    const assistantId = nextAimMessageId()
    setMessages([
      ...thread,
      {
        id: assistantId,
        role: "assistant",
        content: "正在思考，会先读取上下文和资料，再给出回复…",
        editorApply: options?.editorApplyRange ? { range: options.editorApplyRange } : null,
      },
    ])
    setInput("")
    if (images.length) setImageAttachments([])
    setIsThinking(true)
    try {
      const toolAction = detectLarkToolAction(text)
      if (toolAction && projectEnabled && !selectedProjectId) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId ? { ...message, content: "需要先选择 IP 营销全案，才能执行这个飞书同步动作。" } : message
        ))
        return
      }
      const resultId = toolAction === "export_lark_generation" ? getLatestDeliverableId(messages) : undefined
      if (toolAction === "export_lark_generation" && !resultId) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId ? { ...message, content: "当前没有可同步到飞书的 AIM 生成结果。" } : message
        ))
        return
      }
      const chatMessages = thread.map((message) => ({
        role: message.role,
        content: message.role === "user" && message.images?.length
          ? buildChatContent(message.content, message.images)
          : message.content,
      }))
      if (toolAction) {
        const { content } = await chatAim(chatMessages, {
          agentId: selectedAgentId,
          projectId: projectEnabled ? selectedProjectId || undefined : undefined,
          toolAction,
          resultId,
          editorContext: options?.editorContext,
          signal: controller.signal,
        })
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId ? { ...message, content } : message
        ))
        return
      }

      let hasContent = false
      await chatAimStream(chatMessages, {
        agentId: selectedAgentId,
        projectId: projectEnabled ? selectedProjectId || undefined : undefined,
        editorContext: options?.editorContext,
        signal: controller.signal,
        onDelta: (_delta, content) => {
          hasContent = content.length > 0
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId ? { ...message, content } : message
            )
          )
        },
      })
      if (!hasContent) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: "没有收到模型回复。", failure: { kind: "chat", retryText: text } }
            : message
        ))
      }
    } catch (error) {
      const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
      const message = stopped ? "已停止本次回复。" : `对话失败：${error instanceof Error ? error.message : "请稍后重试"}`
      setMessages((prev) => prev.map((item) =>
        item.id === assistantId
          ? { ...item, content: message, failure: stopped ? null : { kind: "chat", retryText: text } }
          : item
      ))
    } finally {
      if (requestAbortRef.current === controller) requestAbortRef.current = null
      setIsThinking(false)
    }
  }

  return { sendText }
}

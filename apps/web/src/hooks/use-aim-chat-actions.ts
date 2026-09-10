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
import type { AimChatToolAction } from "@/lib/api/client"
import type { HitlApprovalRequired } from "@/lib/aim/hitl-gate"
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
  /** Step③ HITL：待审批的高风险动作（对话内回复「批准 / 驳回」即决策） */
  hitlPending?: AimHitlPending | null
  /** 服务端返回 approval_required 时记录待审批上下文 */
  onHitlApprovalRequired?: (pending: AimHitlPending, approval: HitlApprovalRequired) => void
  onHitlSettled?: () => void
}

/** 对话内 HITL 决策词识别：批准/同意 → approve；驳回/拒绝 → reject。 */
function detectHitlDecision(text: string): "approve" | "reject" | undefined {
  const trimmed = text.trim()
  if (/^(批准|同意|通过)[。!！.~\s]*$/.test(trimmed)) return "approve"
  if (/^(驳回|拒绝|不同意|先不要|别发)[。!！.~\s]*$/.test(trimmed)) return "reject"
  return undefined
}

function setAssistantMessage(
  input: AimChatActionInput,
  assistantId: string,
  content: string,
  extra?: { feishuSources?: Array<{ title: string; url: string }> },
) {
  input.setMessages((messages) => messages.map((message) => (
    message.id === assistantId
      ? { ...message, content, ...(extra?.feishuSources ? { feishuSources: extra.feishuSources } : {}) }
      : message
  )))
}

/** Step③ HITL：前端侧的待审批动作上下文（工具动作被服务端门闩拦截时记录）。 */
export interface AimHitlPending {
  toolAction: string
  resultId?: string
  label: string
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
  // Step③ HITL：有待审批动作且用户回复批准/驳回 → 作为决策发送，不走普通对话
  const hitlReply = detectHitlDecision(text)
  if (hitlReply && input.hitlPending) {
    const pending = input.hitlPending
    const { approvalRequired } = await runAimChatRequest({
      messages: buildAimChatMessages(thread.map((message) => ({
        role: message.role,
        content: formatAimMessageContentForModel(message),
      }))),
      agentId: input.selectedAgentId,
      projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
      toolAction: pending.toolAction as AimChatToolAction,
      resultId: pending.resultId,
      hitlDecision: hitlReply,
      signal: controller.signal,
      onContent: (content) => setAssistantMessage(input, assistantId, content),
      onApprovalRequired: (approval) => {
        input.onHitlSettled?.()
        setAssistantMessage(input, assistantId,
          approval.status === "rejected"
            ? "该操作此前已被驳回，如需执行请重新发起。"
            : "仍在等待人工审批。")
      },
    })
    if (!approvalRequired) input.onHitlSettled?.()
    return
  }
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
  const chatResult = await runAimChatRequest({
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
    onFeishuSources: (sources) => {
      setAssistantMessage(input, assistantId, latestContent, { feishuSources: sources })
    },
  })
  if (chatResult.approvalRequired && toolAction) {
    // Step③ HITL：高风险动作被门闩拦截，对话内挂起等待批准/驳回
    input.onHitlSettled?.()
    input.onHitlApprovalRequired?.(
      { toolAction, resultId: resultId || undefined, label: chatResult.approvalRequired.label },
      chatResult.approvalRequired,
    )
    setAssistantMessage(input, assistantId,
      `【需人工审批】${chatResult.approvalRequired.label}。\n纪律要求：这类对外/入库动作必须有人确认。\n回复「批准」执行，或回复「驳回」取消。`)
    return
  }
  if (input.hitlPending) input.onHitlSettled?.()
  if (!chatResult.hasContent) {
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

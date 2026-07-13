"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { toast } from "sonner"

import { generateAimContent, polishScript, ApiError, type ContentFormat } from "@/lib/api/client"
import { AIM_CONTENT_ACTIONS, type AimContentAction, type AimWorkflowStage, type ConfirmedWorkflowBrief } from "@/lib/aim-workflow"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"
import { nextAimMessageId } from "@/features/aim/aim-id"
import { buildRawInputFromMessages } from "@/features/aim/aim-command-utils"
import {
  buildHistoryRawInput,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
} from "@/features/aim/aim-text-utils"

interface WorkflowBriefState {
  sourceGenerationId?: string
  nextInput: string
  confirmed: ConfirmedWorkflowBrief
}

interface GenerateAgent {
  id: AimAgentId
  title: string
  primaryActionLabel: string
  defaultInstruction: string
  defaultFormats: ContentFormat[]
}

interface GenerateWithInputOptions {
  retryMessageId?: string
}

interface UseAimGenerateActionsOptions {
  agent: GenerateAgent
  selectedAgentId: AimAgentId
  selectedProjectId: string
  projectEnabled: boolean
  messages: ChatMessage[]
  sourceVideoCopyExtractionId?: string
  sourceTopicTitle: string
  sourceTopicRationale: string
  topicSelectionId?: string
  selectedTopicIndex?: number
  contentAction: AimContentAction | null
  workflowBrief: WorkflowBriefState | null
  currentWorkflowStage: AimWorkflowStage
  requestAbortRef: MutableRefObject<AbortController | null>
  pendingScrollMessageIdRef: MutableRefObject<string | null>
  refreshHistory: (opts?: { force?: boolean; agentId?: string; projectId?: string }) => Promise<void>
  refreshProjectWorkflow: () => void | (() => void) | Promise<void | (() => void)>
  openEditorFromResult: (messageId: string, format: ContentFormat, content: string) => void
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setInput: Dispatch<SetStateAction<string>>
  setIsGenerating: Dispatch<SetStateAction<boolean>>
  setSourceOriginalText: Dispatch<SetStateAction<string>>
  setSourceAnalysisText: Dispatch<SetStateAction<string>>
  setWorkflowBrief: Dispatch<SetStateAction<WorkflowBriefState | null>>
  setContentAction: Dispatch<SetStateAction<AimContentAction | null>>
}

export function useAimGenerateActions({
  agent,
  selectedAgentId,
  selectedProjectId,
  projectEnabled,
  messages,
  sourceVideoCopyExtractionId,
  sourceTopicTitle,
  sourceTopicRationale,
  topicSelectionId,
  selectedTopicIndex,
  contentAction,
  workflowBrief,
  currentWorkflowStage,
  requestAbortRef,
  pendingScrollMessageIdRef,
  refreshHistory,
  refreshProjectWorkflow,
  openEditorFromResult,
  setMessages,
  setInput,
  setIsGenerating,
  setSourceOriginalText,
  setSourceAnalysisText,
  setWorkflowBrief,
  setContentAction,
}: UseAimGenerateActionsOptions) {
  async function generateWithInput(currentInput: string, options?: GenerateWithInputOptions) {
    const rawInput = buildRawInputFromMessages(messages, currentInput || undefined)
    if (!rawInput) {
      toast.error("请先在对话框里说点素材或需求")
      return
    }
    if (projectEnabled && !selectedProjectId) {
      toast.error("你的 IP 营销全案还在配置中")
      return
    }
    const controller = new AbortController()
    requestAbortRef.current = controller
    const assistantMessageId = nextAimMessageId()
    pendingScrollMessageIdRef.current = assistantMessageId
    const baseMessages = options?.retryMessageId
      ? messages.filter((message) => message.id !== options.retryMessageId)
      : messages
    setMessages((prev) => [
      ...(options?.retryMessageId
        ? prev.filter((message) => message.id !== options.retryMessageId)
        : prev),
      ...(currentInput && !options?.retryMessageId ? [{ id: nextAimMessageId(), role: "user" as const, content: currentInput }] : []),
      {
        id: assistantMessageId,
        role: "assistant" as const,
        content: `正在${agent.primaryActionLabel}，会先读取项目资料、匹配知识库，再生成交付物…`,
        agentId: agent.id,
      },
    ])
    if (currentInput) setInput("")
    setIsGenerating(true)
    try {
      const response = await generateAimContent({
        agentId: selectedAgentId,
        rawInput: buildHistoryRawInput(rawInput, options?.retryMessageId ? "" : currentInput, baseMessages),
        targetFormats: agent.defaultFormats,
        projectId: projectEnabled ? selectedProjectId || undefined : undefined,
        videoCopyExtractionId: sourceVideoCopyExtractionId,
        topicTitle: sourceTopicTitle.trim() || undefined,
        topicRationale: sourceTopicRationale.trim() || undefined,
        topicSelectionId,
        selectedTopicIndex: Number.isFinite(selectedTopicIndex) ? selectedTopicIndex : undefined,
        taskType: contentAction
          ? AIM_CONTENT_ACTIONS.find((item) => item.id === contentAction)?.taskType || "write_script"
          : "write_script",
        useMarketViralVideos: selectedAgentId === "business_diagnosis",
        workflow: workflowBrief
          ? {
              stage: "content",
              sourceGenerationId: workflowBrief.sourceGenerationId,
              confirmed: workflowBrief.confirmed,
            }
          : undefined,
      }, controller.signal)
      const proofreadFormats = new Set<ContentFormat>(["raw_copy", "video_script", "koubo_script"])
      const proofreadResults = await Promise.all(
        response.results.map(async (result) => {
          if (!proofreadFormats.has(result.format) || result.content.trim().length < 30) return result
          try {
            const polished = await polishScript({
              content: result.content,
              persona: agent.defaultInstruction,
              mode: "proofread",
            })
            return {
              ...result,
              content: polished.polished,
              wordCount: polished.polished.length,
            }
          } catch {
            return result
          }
        }),
      )
      const correctedResponse = { ...response, results: proofreadResults }
      const extractedOriginalText = extractBenchmarkOriginalText(currentInput)
      const extractedAnalysisText = extractBenchmarkAnalysisText(currentInput)
      if (extractedOriginalText) setSourceOriginalText(extractedOriginalText)
      if (extractedAnalysisText) setSourceAnalysisText(extractedAnalysisText)
      const mainResult = response.results[0]
      setMessages((prev) => prev.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              content: `${agent.title} 交付物已生成，可直接复制使用，也能继续在下方对话里让我改写。`,
              agentId: agent.id,
              deliverables: correctedResponse,
              runId: response.runId ?? null,
              degraded: response.degraded ?? null,
              qualityStatus: response.qualityStatus ?? null,
              workflowStage: currentWorkflowStage,
              contentAction,
            }
          : message
      ))
      if (mainResult) {
        const correctedMainResult = correctedResponse.results[0] ?? mainResult
        openEditorFromResult(
          assistantMessageId,
          correctedMainResult.format,
          correctedMainResult.content,
        )
      }
      refreshHistory({ force: true, agentId: selectedAgentId })
      refreshProjectWorkflow()
      setWorkflowBrief(null)
      setContentAction(null)
      toast.success(`${agent.primaryActionLabel}完毕`)
    } catch (error) {
      const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
      const message = stopped ? "已停止本次生成。" : `生成失败：${error instanceof Error ? error.message : "请稍后重试"}`
      setMessages((prev) => prev.map((item) =>
        item.id === assistantMessageId
          ? { ...item, content: message, failure: stopped ? null : { kind: "generate", retryText: currentInput } }
          : item
      ))
    } finally {
      if (requestAbortRef.current === controller) requestAbortRef.current = null
      setIsGenerating(false)
    }
  }

  return { generateWithInput }
}

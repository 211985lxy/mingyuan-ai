"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { toast } from "sonner"

import {
  ApiError,
  checkScriptQuality,
  generateAimContent,
  type AimGenerateResponse,
  type ContentFormat,
} from "@/lib/api/client"
import { AIM_CONTENT_ACTIONS, type AimContentAction, type AimWorkflowStage, type ConfirmedWorkflowBrief } from "@/lib/aim-workflow"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { CopyStudioModule } from "@/lib/copy-studio"
import { proofreadAimResponse } from "@/lib/aim/generation-proofread"
import { AIM_FORMAT_LABELS } from "@/lib/aim/workbench-display"
import {
  buildAimHistoryRawInput,
  buildAimRawInput,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  nextAimWorkbenchId,
} from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

type MessageSetter = Dispatch<SetStateAction<AimWorkbenchMessage[]>>
type StringSetter = Dispatch<SetStateAction<string>>
type BooleanSetter = Dispatch<SetStateAction<boolean>>

export interface AimWorkflowBriefState {
  sourceGenerationId?: string
  nextInput: string
  confirmed: ConfirmedWorkflowBrief
}

interface AimGenerationAgent {
  id: AimAgentId
  title: string
  primaryActionLabel: string
  defaultFormats: ContentFormat[]
  defaultInstruction: string
}

export interface AimGenerationActionInput {
  messages: AimWorkbenchMessage[]
  setMessages: MessageSetter
  setInput: StringSetter
  setSourceOriginalText: StringSetter
  setSourceAnalysisText: StringSetter
  setWorkflowBrief: Dispatch<SetStateAction<AimWorkflowBriefState | null>>
  setContentAction: Dispatch<SetStateAction<AimContentAction | null>>
  setIsGenerating: BooleanSetter
  setIsQualityChecking: BooleanSetter
  agent: AimGenerationAgent
  selectedAgentId: AimAgentId
  selectedProjectId: string
  projectEnabled: boolean
  currentWorkflowStage: AimWorkflowStage
  contentAction: AimContentAction | null
  workflowBrief: AimWorkflowBriefState | null
  sourceVideoCopyExtractionId?: string
  sourceTopicTitle: string
  sourceTopicRationale: string
  topicSelectionId?: string | null
  selectedTopicIndex: number
  requestAbortRef: MutableRefObject<AbortController | null>
  pendingScrollMessageIdRef: MutableRefObject<string | null>
  clearCurrentTaskContext: () => void
  openEditorFromResult: (messageId: string, format: ContentFormat, content: string) => void
  refreshHistory: (options?: { projectId?: string; agentId?: string; force?: boolean }) => Promise<void>
  refreshProjectWorkflow: () => Promise<void>
  agentModule?: CopyStudioModule
}

interface GenerateOptions {
  retryMessageId?: string
  startsNewTask?: boolean
}

export function getAimPendingGenerationMessage(projectEnabled: boolean, actionLabel: string) {
  return projectEnabled
    ? `正在${actionLabel}，会读取当前项目资料并匹配知识库，再生成交付物…`
    : `正在${actionLabel}，将根据本次输入生成交付物…`
}

function appendPendingGeneration(input: AimGenerationActionInput, currentInput: string, options: GenerateOptions) {
  const assistantMessageId = nextAimWorkbenchId()
  input.pendingScrollMessageIdRef.current = assistantMessageId
  const baseMessages = options.startsNewTask
    ? []
    : options.retryMessageId
      ? input.messages.filter((message) => message.id !== options.retryMessageId)
      : input.messages
  if (options.startsNewTask) input.clearCurrentTaskContext()
  input.setMessages((messages) => [
    ...(options.startsNewTask ? [] : options.retryMessageId ? messages.filter((message) => message.id !== options.retryMessageId) : messages),
    ...(currentInput && !options.retryMessageId ? [{ id: nextAimWorkbenchId(), role: "user" as const, content: currentInput }] : []),
    { id: assistantMessageId, role: "assistant" as const, content: getAimPendingGenerationMessage(input.projectEnabled, input.agent.primaryActionLabel), agentId: input.agent.id },
  ])
  if (currentInput) input.setInput("")
  return { assistantMessageId, baseMessages }
}

function buildGenerationRequest(
  input: AimGenerationActionInput,
  rawInput: string,
  currentInput: string,
  baseMessages: AimWorkbenchMessage[],
  options: GenerateOptions,
) {
  const keepContext = !options.startsNewTask
  return {
    agentId: input.selectedAgentId,
    agentModule: input.agentModule,
    writerModule: input.agentModule,
    rawInput: buildAimHistoryRawInput(rawInput, options.retryMessageId ? "" : currentInput, baseMessages),
    targetFormats: input.agent.defaultFormats,
    projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
    videoCopyExtractionId: keepContext ? input.sourceVideoCopyExtractionId : undefined,
    topicTitle: keepContext ? input.sourceTopicTitle.trim() || undefined : undefined,
    topicRationale: keepContext ? input.sourceTopicRationale.trim() || undefined : undefined,
    topicSelectionId: keepContext ? input.topicSelectionId || undefined : undefined,
    selectedTopicIndex: keepContext && Number.isFinite(input.selectedTopicIndex) ? input.selectedTopicIndex : undefined,
    taskType: input.contentAction
      ? AIM_CONTENT_ACTIONS.find((item) => item.id === input.contentAction)?.taskType || "write_script"
      : "write_script",
    useMarketViralVideos: input.selectedAgentId === "business_diagnosis",
    workflow: input.workflowBrief ? {
      stage: "content" as const,
      sourceGenerationId: input.workflowBrief.sourceGenerationId,
      confirmed: input.workflowBrief.confirmed,
    } : undefined,
  }
}

function applyGenerationResponse(
  input: AimGenerationActionInput,
  assistantMessageId: string,
  currentInput: string,
  response: AimGenerateResponse,
  correctedResponse: AimGenerateResponse,
) {
  const originalText = extractBenchmarkOriginalText(currentInput)
  const analysisText = extractBenchmarkAnalysisText(currentInput)
  if (originalText) input.setSourceOriginalText(originalText)
  if (analysisText) input.setSourceAnalysisText(analysisText)
  input.setMessages((messages) => messages.map((message) => message.id === assistantMessageId ? {
    ...message,
    content: `${input.agent.title} 交付物已生成，可直接复制使用，也能继续在下方对话里让我改写。`,
    agentId: input.agent.id,
    deliverables: correctedResponse,
    runId: response.runId ?? null,
    degraded: response.degraded ?? null,
    qualityStatus: response.qualityStatus ?? null,
    workflowStage: input.currentWorkflowStage,
    contentAction: input.contentAction,
  } : message))
  const mainResult = correctedResponse.results[0] ?? response.results[0]
  if (mainResult) input.openEditorFromResult(assistantMessageId, mainResult.format, mainResult.content)
  void input.refreshHistory({ force: true, agentId: input.selectedAgentId })
  if (input.selectedProjectId) void input.refreshProjectWorkflow()
  input.setWorkflowBrief(null)
  input.setContentAction(null)
  toast.success(`${input.agent.primaryActionLabel}完毕`)
}

async function executeGeneration(input: AimGenerationActionInput, currentInput: string, rawInput: string, options: GenerateOptions) {
  const controller = new AbortController()
  input.requestAbortRef.current = controller
  const { assistantMessageId, baseMessages } = appendPendingGeneration(input, currentInput, options)
  input.setIsGenerating(true)
  try {
    const response = await generateAimContent(buildGenerationRequest(input, rawInput, currentInput, baseMessages, options), controller.signal)
    const correctedResponse = await proofreadAimResponse(response, input.agent.defaultInstruction)
    applyGenerationResponse(input, assistantMessageId, currentInput, response, correctedResponse)
  } catch (error) {
    const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
    const content = stopped ? "已停止本次生成。" : `生成失败：${error instanceof Error ? error.message : "请稍后重试"}`
    input.setMessages((messages) => messages.map((message) => message.id === assistantMessageId
      ? { ...message, content, failure: stopped ? null : { kind: "generate", retryText: currentInput } }
      : message))
  } finally {
    if (input.requestAbortRef.current === controller) input.requestAbortRef.current = null
    input.setIsGenerating(false)
  }
}

async function generateWithInput(input: AimGenerationActionInput, currentInput: string, options: GenerateOptions = {}) {
  const rawInput = options.startsNewTask ? currentInput : buildAimRawInput(input.messages, currentInput || undefined)
  if (!rawInput) return toast.error("请先在对话框里说点素材或需求")
  if (input.projectEnabled && !input.selectedProjectId) return toast.error("你的 IP 营销全案还在配置中")
  await executeGeneration(input, currentInput, rawInput, options)
}

async function repurposeDeliverable(input: AimGenerationActionInput, messageId: string, format: ContentFormat) {
  input.setIsGenerating(true)
  try {
    if (input.projectEnabled && !input.selectedProjectId) return toast.error("你的 IP 营销全案还在配置中")
    const deliverables = input.messages.find((message) => message.id === messageId)?.deliverables
    const mainContent = deliverables?.results.find((result) => result.format === "video_script")?.content
    if (!mainContent) return
    const response = await generateAimContent({
      rawInput: `基于以下脚本，派生${AIM_FORMAT_LABELS[format]}：\n\n${mainContent}`,
      targetFormats: [format],
      projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
      taskType: "repurpose",
    })
    input.setMessages((messages) => messages.map((message) => message.id === messageId && message.deliverables
      ? { ...message, deliverables: { ...message.deliverables, results: [...message.deliverables.results, ...response.results] } }
      : message))
    void input.refreshHistory({ force: true, agentId: input.selectedAgentId })
    toast.success(`${AIM_FORMAT_LABELS[format]}已生成`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "生成失败")
  } finally {
    input.setIsGenerating(false)
  }
}

async function checkDeliverableQuality(input: AimGenerationActionInput, messageId: string) {
  const deliverables = input.messages.find((message) => message.id === messageId)?.deliverables
  const mainContent = deliverables?.results.find((result) => result.format === "video_script")?.content
    || deliverables?.results.find((result) => result.format === "koubo_script")?.content
  if (!mainContent) return
  input.setIsQualityChecking(true)
  try {
    const report = await checkScriptQuality({ content: mainContent, persona: input.agent.defaultInstruction, publishPlatform: "douyin" })
    input.setMessages((messages) => messages.map((message) => message.id === messageId ? { ...message, qualityReport: report } : message))
    toast.success("发布前自查完成")
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "质检失败")
  } finally {
    input.setIsQualityChecking(false)
  }
}

export function useAimGenerationActions(input: AimGenerationActionInput) {
  return {
    generateWithInput: (currentInput: string, options?: GenerateOptions) => generateWithInput(input, currentInput, options),
    stopGeneration: () => input.requestAbortRef.current?.abort(),
    repurposeDeliverable: (messageId: string) => (format: ContentFormat) => repurposeDeliverable(input, messageId, format),
    checkDeliverableQuality: (messageId: string) => () => checkDeliverableQuality(input, messageId),
  }
}

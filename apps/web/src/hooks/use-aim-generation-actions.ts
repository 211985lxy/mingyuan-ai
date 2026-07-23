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
import {
  buildAimHistoryRawInput,
  buildAimRawInput,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  nextAimWorkbenchId,
} from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { AimTurnIntent } from "@/lib/aim-turn-intent"
import { repurposeDeliverable } from "@/hooks/aim-repurpose-content-package"

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
  /** ADR-002：本次选中的命名方法论 profile id。 */
  selectedMethodologyProfileIds?: string[]
}

interface GenerateOptions {
  retryMessageId?: string
  startsNewTask?: boolean
  /** 计划模式确认后的任务单显式传递，避免依赖 React 状态异步更新 */
  workflowBriefOverride?: AimWorkflowBriefState | null
  /** 用户确认的本轮意图 */
  confirmedTurnIntent?: AimTurnIntent
}

/**
 * @description 获取aimpendinggenerationmessage
 * @param projectEnabled - project是否启用
 * @param actionLabel - 操作标签
 * @returns 无返回值
 */
export function getAimPendingGenerationMessage(projectEnabled: boolean, actionLabel: string) {
  return projectEnabled
    ? `正在${actionLabel}，会读取当前项目资料并匹配知识库，再生成交付物…`
    : `正在${actionLabel}，将根据本次输入生成交付物…`
}

function getDeliverableReadyMessage(agentTitle: string) {
  return `${agentTitle} 交付物已生成，可直接复制使用，也能继续在下方对话里让我改写。`
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
    {
      id: assistantMessageId,
      role: "assistant" as const,
      content: getAimPendingGenerationMessage(input.projectEnabled, input.agent.primaryActionLabel),
      agentId: input.agent.id,
      regenerating: false,
    },
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
    workflow: (options.workflowBriefOverride !== undefined ? options.workflowBriefOverride : input.workflowBrief) ? {
      stage: "content" as const,
      sourceGenerationId: (options.workflowBriefOverride !== undefined ? options.workflowBriefOverride : input.workflowBrief)!.sourceGenerationId,
      confirmed: (options.workflowBriefOverride !== undefined ? options.workflowBriefOverride : input.workflowBrief)!.confirmed,
    } : undefined,
    methodologyProfileIds: input.selectedMethodologyProfileIds?.length ? input.selectedMethodologyProfileIds : undefined,
    confirmedTurnIntent: options.confirmedTurnIntent,
  }
}

function applyGenerationResponse(
  input: AimGenerationActionInput,
  assistantMessageId: string,
  currentInput: string,
  response: AimGenerateResponse,
) {
  const originalText = extractBenchmarkOriginalText(currentInput)
  const analysisText = extractBenchmarkAnalysisText(currentInput)
  if (originalText) input.setSourceOriginalText(originalText)
  if (analysisText) input.setSourceAnalysisText(analysisText)
  input.setMessages((messages) => messages.map((message) => message.id === assistantMessageId ? {
    ...message,
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
  } : message))
  const mainResult = response.results[0]
  if (mainResult) input.openEditorFromResult(assistantMessageId, mainResult.format, mainResult.content)
  void input.refreshHistory({ force: true, agentId: input.selectedAgentId })
  if (input.selectedProjectId) void input.refreshProjectWorkflow()
  input.setWorkflowBrief(null)
  input.setContentAction(null)
  toast.success(`${input.agent.primaryActionLabel}完毕`)
}

/** 校对不挡首出：后台软替换交付物与编辑器 */
async function softProofreadInBackground(
  input: AimGenerationActionInput,
  assistantMessageId: string,
  response: AimGenerateResponse,
  signal: AbortSignal,
) {
  try {
    const corrected = await proofreadAimResponse(response, input.agent.defaultInstruction)
    if (signal.aborted) return
    const mainResult = corrected.results[0]
    let didApply = false
    input.setMessages((messages) => {
      const target = messages.find((message) => message.id === assistantMessageId)
      if (!target?.deliverables || target.deliverables.id !== response.id || target.regenerating) {
        return messages
      }
      didApply = true
      return messages.map((message) => message.id === assistantMessageId
        ? { ...message, deliverables: corrected }
        : message)
    })
    if (didApply && mainResult && !signal.aborted) {
      input.openEditorFromResult(assistantMessageId, mainResult.format, mainResult.content)
    }
  } catch {
    // 校对失败静默保留原稿
  }
}

function markGenerationStopped(input: AimGenerationActionInput, assistantMessageId: string) {
  input.setMessages((messages) => messages.map((message) => {
    if (message.id !== assistantMessageId) return message
    return { ...message, content: "已停止本次生成。", regenerating: false, failure: null }
  }))
}

function isTransientGenerateFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return error instanceof TypeError || (error instanceof Error && /fetch failed|network|Failed to fetch/i.test(error.message))
  }
  return error.status === 408 || error.status === 502 || error.status === 503 || error.status === 504
}

async function generateAimContentWithTransientRetry(
  body: Parameters<typeof generateAimContent>[0],
  signal: AbortSignal,
): Promise<AimGenerateResponse> {
  const maxAttempts = 2
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await generateAimContent(body, signal)
    } catch (error) {
      lastError = error
      if (signal.aborted || attempt >= maxAttempts - 1 || !isTransientGenerateFailure(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
    }
  }
  throw lastError
}

function beginExclusiveRequest(requestAbortRef: MutableRefObject<AbortController | null>) {
  // 连续「重新生成」时先中止上一次未完成请求，避免 AbortController 被覆盖后
  // finally 误把 busy 清掉、或旧请求晚到覆盖新结果。
  requestAbortRef.current?.abort()
  const controller = new AbortController()
  requestAbortRef.current = controller
  return controller
}

function endExclusiveRequest(
  requestAbortRef: MutableRefObject<AbortController | null>,
  controller: AbortController,
  clearBusy: () => void,
) {
  // 仅当仍持有本次 controller 时才清 busy，防止被后续请求接管后误解锁
  if (requestAbortRef.current === controller) {
    requestAbortRef.current = null
    clearBusy()
  }
}

async function executeGeneration(input: AimGenerationActionInput, currentInput: string, rawInput: string, options: GenerateOptions) {
  const controller = beginExclusiveRequest(input.requestAbortRef)
  const { assistantMessageId, baseMessages } = appendPendingGeneration(input, currentInput, options)
  const traceId = crypto.randomUUID()
  input.setMessages((messages) => messages.map((message) => message.id === assistantMessageId
    ? { ...message, traceId, traceType: "generate" as const }
    : message))
  input.setIsGenerating(true)
  try {
    const response = await generateAimContentWithTransientRetry(
      { ...buildGenerationRequest(input, rawInput, currentInput, baseMessages, options), traceId },
      controller.signal,
    )
    if (controller.signal.aborted) {
      markGenerationStopped(input, assistantMessageId)
      return
    }
    // 先出稿：不等校对
    applyGenerationResponse(input, assistantMessageId, currentInput, response)
    endExclusiveRequest(input.requestAbortRef, controller, () => input.setIsGenerating(false))
    // 后台校对软替换（不挡继续改稿）
    void softProofreadInBackground(input, assistantMessageId, response, controller.signal)
  } catch (error) {
    const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
    if (stopped) {
      markGenerationStopped(input, assistantMessageId)
    } else {
      input.setMessages((messages) => messages.map((message) => message.id === assistantMessageId
        ? {
            ...message,
            content: `生成失败：${error instanceof Error ? error.message : "请稍后重试"}`,
            regenerating: false,
            failure: { kind: "generate" as const, retryText: currentInput },
          }
        : message))
    }
  } finally {
    endExclusiveRequest(input.requestAbortRef, controller, () => input.setIsGenerating(false))
  }
}

async function generateWithInput(input: AimGenerationActionInput, currentInput: string, options: GenerateOptions = {}) {
  const rawInput = options.startsNewTask ? currentInput : buildAimRawInput(input.messages, currentInput || undefined)
  if (!rawInput) return toast.error("请先在对话框里说点素材或需求")
  if (input.projectEnabled && !input.selectedProjectId) return toast.error("你的 IP 营销全案还在配置中")
  await executeGeneration(input, currentInput, rawInput, options)
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

/**
 * @description React Hook：aimgenerationed
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimGenerationActions(input: AimGenerationActionInput) {
  return {
    generateWithInput: (currentInput: string, options?: GenerateOptions) => generateWithInput(input, currentInput, options),
    stopGeneration: () => input.requestAbortRef.current?.abort(),
    repurposeDeliverable: (messageId: string) => (formats: ContentFormat | ContentFormat[]) =>
      repurposeDeliverable(input, messageId, formats),
    checkDeliverableQuality: (messageId: string) => () => checkDeliverableQuality(input, messageId),
  }
}

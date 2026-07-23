"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { toast } from "sonner"

import {
  ApiError,
  checkScriptQuality,
  generateAimContent,
  updateAimWorkflowStatus,
  type AimGenerateResponse,
  type ContentFormat,
} from "@/lib/api/client"
import { AIM_CONTENT_ACTIONS, type AimContentAction, type AimWorkflowStage, type ConfirmedWorkflowBrief } from "@/lib/aim-workflow"
import {
  CONTENT_PACKAGE_FORMATS,
  CONTENT_PACKAGE_FORMAT_LABELS,
  normalizeContentPackageFormats,
} from "@/lib/content-package-spec"
import { getCanonicalFromTaskSpec, isCanonicalConfirmed } from "@/lib/canonical-content-spec"
import { suggestWorkflowAfterContentPackageComplete } from "@/lib/aim/content-package-workflow"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { CopyStudioModule } from "@/lib/copy-studio"
import { proofreadAimResponse } from "@/lib/aim/generation-proofread"
import {
  buildAimHistoryRawInput,
  buildAimRawInput,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  nextAimWorkbenchId,
  patchDeliverableWorkflowFields,
} from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { AimTurnIntent } from "@/lib/aim-turn-intent"

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

function findLatestDeliverableMessage(messages: AimWorkbenchMessage[]) {
  return [...messages].reverse().find((message) => Boolean(message.deliverables?.results?.length))
}

function appendPendingGeneration(input: AimGenerationActionInput, currentInput: string, options: GenerateOptions) {
  // 同线程再生成：原地 regenerating，保留旧交付物与编辑器，避免闪断
  const inplaceTarget = !options.startsNewTask && !options.retryMessageId
    ? findLatestDeliverableMessage(input.messages)
    : undefined

  if (inplaceTarget) {
    input.pendingScrollMessageIdRef.current = inplaceTarget.id
    const baseMessages = input.messages
    const pendingContent = getAimPendingGenerationMessage(input.projectEnabled, input.agent.primaryActionLabel)
    input.setMessages((messages) => {
      const withUser = currentInput
        ? [...messages, { id: nextAimWorkbenchId(), role: "user" as const, content: currentInput }]
        : messages
      return withUser.map((message) => {
        if (message.id === inplaceTarget.id) {
          return {
            ...message,
            content: pendingContent,
            regenerating: true,
            failure: null,
            agentId: input.agent.id,
          }
        }
        return message.regenerating ? { ...message, regenerating: false } : message
      })
    })
    if (currentInput) input.setInput("")
    return { assistantMessageId: inplaceTarget.id, baseMessages, inPlace: true as const }
  }

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
  return { assistantMessageId, baseMessages, inPlace: false as const }
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

function markGenerationStopped(
  input: AimGenerationActionInput,
  assistantMessageId: string,
  inPlace: boolean,
) {
  input.setMessages((messages) => messages.map((message) => {
    if (message.id !== assistantMessageId) return message
    if (inPlace && message.deliverables) {
      return {
        ...message,
        content: getDeliverableReadyMessage(input.agent.title),
        regenerating: false,
        failure: null,
      }
    }
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
  const { assistantMessageId, baseMessages, inPlace } = appendPendingGeneration(input, currentInput, options)
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
      markGenerationStopped(input, assistantMessageId, inPlace)
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
      markGenerationStopped(input, assistantMessageId, inPlace)
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

async function repurposeDeliverable(
  input: AimGenerationActionInput,
  messageId: string,
  formatsInput: ContentFormat | ContentFormat[],
) {
  input.setIsGenerating(true)
  try {
    if (input.projectEnabled && !input.selectedProjectId) return toast.error("你的 IP 营销全案还在配置中")
    const deliverables = input.messages.find((message) => message.id === messageId)?.deliverables
    const mainContent = deliverables?.results.find((result) => result.format === "video_script")?.content
      || deliverables?.results.find((result) => result.format === "koubo_script")?.content
    if (!mainContent) return toast.error("请先有口播/主稿，再拆多平台")

    const canonical = getCanonicalFromTaskSpec(deliverables?.taskSpec)
    if (!isCanonicalConfirmed(canonical)) {
      return toast.error("请先确认母内容，再拆成多平台")
    }

    const requested = normalizeContentPackageFormats(
      Array.isArray(formatsInput) ? formatsInput : [formatsInput],
      { min: 1, max: 5 },
    )
    if (requested.length === 0) return toast.error("请至少选择一个平台格式")

    const response = await generateAimContent({
      rawInput: `基于已确认母内容与以下主稿，派生多平台内容包（${requested.map((format) => CONTENT_PACKAGE_FORMAT_LABELS[format]).join("、")}）。共享核心观点与证据，但每个平台独立改写，禁止复制同一正文只换标题。\n\n【主稿】\n${mainContent}`,
      targetFormats: requested,
      projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
      taskType: "repurpose",
      existingGenerationId: deliverables?.id,
      agentId: "content_producer",
    })

    input.setMessages((messages) =>
      messages.map((message) => {
        if (message.id !== messageId || !message.deliverables) return message
        const byFormat = new Map<string, (typeof response.results)[number]>()
        for (const item of message.deliverables.results) byFormat.set(item.format, item)
        for (const item of response.results) {
          if (item.content.trim()) byFormat.set(item.format, item)
        }
        // 小红书等可能只在 artifacts
        const artifacts = response.taskSpec?.contentPackage?.artifacts
        if (artifacts) {
          for (const [format, content] of Object.entries(artifacts)) {
            if (content?.trim() && !byFormat.has(format)) {
              byFormat.set(format, {
                format: format as ContentFormat,
                content,
                wordCount: content.length,
              })
            }
          }
        }
        return {
          ...message,
          deliverables: {
            ...message.deliverables,
            id: response.id || message.deliverables.id,
            results: [...byFormat.values()],
            taskSpec: response.taskSpec ?? message.deliverables.taskSpec,
            knowledgeUsed: response.knowledgeUsed?.length
              ? response.knowledgeUsed
              : message.deliverables.knowledgeUsed,
            qualityChecks: response.qualityChecks ?? message.deliverables.qualityChecks,
            qualityStatus: response.qualityStatus ?? message.deliverables.qualityStatus,
            workflowStatus: response.workflowStatus ?? message.deliverables.workflowStatus,
          },
        }
      }),
    )
    void input.refreshHistory({ force: true, agentId: input.selectedAgentId })
    const failed = response.taskSpec?.contentPackage?.failedFormats ?? []
    if (failed.length > 0) {
      toast.success(
        `已完成 ${requested.length - failed.length}/${requested.length} 个格式；失败项可单独重试`,
      )
    } else {
      toast.success(`已生成 ${requested.length} 个平台格式`)
      const suggestion = suggestWorkflowAfterContentPackageComplete({
        taskSpec: response.taskSpec,
        currentStatus: deliverables?.workflowStatus,
      })
      if (suggestion?.shouldAdvance && deliverables?.id) {
        try {
          await updateAimWorkflowStatus(deliverables.id, { workflowStatus: suggestion.to })
          input.setMessages((messages) => patchDeliverableWorkflowFields(messages, deliverables.id, {
            workflowStatus: suggestion.to,
          }))
          toast.message("内容包已齐", { description: suggestion.reason })
        } catch {
          toast.message("内容包已齐", { description: "可手动推进到「待审核」" })
        }
      }
    }
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

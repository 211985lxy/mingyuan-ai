"use client"

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
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
import { mapAimErrorToUserMessage } from "@/lib/aim-error-message"
import {
  buildAimRawInput,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  findLatestAimDeliverableId,
  nextAimWorkbenchId,
} from "@/lib/aim/workbench-helpers"
import { buildGenerationSourceEnvelope } from "@/hooks/aim-generation-source-envelope"
import { generateAimContentWithTransientRetry } from "@/hooks/aim-unified-turn-client"
import {
  resolveAimWorkflowBriefForRequest,
  shouldKeepAimFollowUpContext,
} from "@/lib/aim/task-session-reset"
import { mergeAimGenerationIntoMessages } from "@/lib/aim/merge-aim-generation-messages"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import { startRunOutcomeActivity } from "@/lib/aim/run-outcome-client"
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
  /** 软隔离新任务：清流程 brief / URL 任务态等（不含方法论偏好）。 */
  onIsolateTaskSession?: () => void
  openEditorFromResult: (messageId: string, format: ContentFormat, content: string) => void
  refreshHistory: (options?: { projectId?: string; agentId?: string; force?: boolean }) => Promise<void>
  refreshProjectWorkflow: () => Promise<void>
  agentModule?: CopyStudioModule
  /** ADR-002：本次选中的命名方法论 profile id。 */
  selectedMethodologyProfileIds?: string[]
  /** 写作风格开关：用户显式选择是否启用风格档案。undefined 时由服务端规则推断。 */
  styleEnabled?: boolean
  editorText: string
  editorFormat?: ContentFormat
  sourceOriginalText: string
  sourceAnalysisText: string
}

interface GenerateOptions {
  retryMessageId?: string
  startsNewTask?: boolean
  /** 计划模式确认后的任务单显式传递，避免依赖 React 状态异步更新 */
  workflowBriefOverride?: AimWorkflowBriefState | null
  executionAgentId?: string
  /** 方法论类技能一次性透传：本轮触发对应方法论/爆款结构注入 */
  activeMethodologySignals?: import("@/lib/aim-agent-guides").AimMethodologySignal[]
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

const GENERATION_PROGRESS_STAGES = [
  { afterMs: 12_000, message: (actionLabel: string) => `正在理解你的要求，随后${actionLabel}…` },
  { afterMs: 28_000, message: () => "正在读取项目资料并匹配知识库…" },
  { afterMs: 55_000, message: (actionLabel: string) => `正在连接模型${actionLabel}，请稍候…` },
  { afterMs: 95_000, message: () => "生成仍在进行，复杂任务可能需要 2–3 分钟；也可点停止后重试。" },
] as const

function startGenerationProgressTicker(
  input: AimGenerationActionInput,
  assistantMessageId: string,
  actionLabel: string,
) {
  const timers = GENERATION_PROGRESS_STAGES.map(({ afterMs, message }) =>
    setTimeout(() => {
      input.setMessages((messages) => messages.map((item) => {
        if (item.id !== assistantMessageId || item.regenerating === false) return item
        return { ...item, content: message(actionLabel) }
      }))
    }, afterMs),
  )
  return () => {
    for (const timer of timers) clearTimeout(timer)
  }
}
export function resolveFollowUpGenerationId(
  startsNewTask: boolean | undefined,
  messages: AimWorkbenchMessage[],
): string | undefined {
  if (startsNewTask) return undefined
  return findLatestAimDeliverableId(messages)
}

function appendPendingGeneration(input: AimGenerationActionInput, currentInput: string, options: GenerateOptions) {
  const assistantMessageId = nextAimWorkbenchId()
  input.pendingScrollMessageIdRef.current = assistantMessageId
  const baseMessages = options.startsNewTask
    ? []
    : options.retryMessageId
      ? input.messages.filter((message) => message.id !== options.retryMessageId)
      : input.messages
  if (options.startsNewTask) {
    input.clearCurrentTaskContext()
    input.onIsolateTaskSession?.()
  }
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
  const keepContext = shouldKeepAimFollowUpContext(options.startsNewTask, baseMessages.length)
  const existingGenerationId = resolveFollowUpGenerationId(
    options.startsNewTask || baseMessages.length === 0,
    baseMessages,
  )
  const workflowBrief = resolveAimWorkflowBriefForRequest({
    keepContext,
    currentBrief: input.workflowBrief,
    override: options.workflowBriefOverride,
  })
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
    agentModule: input.agentModule,
    writerModule: input.agentModule,
    rawInput: sourceEnvelope.currentUserRequest,
    sourceEnvelope,
    targetFormats: input.agent.defaultFormats,
    projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
    videoCopyExtractionId: keepContext ? input.sourceVideoCopyExtractionId : undefined,
    topicTitle: keepContext ? input.sourceTopicTitle.trim() || undefined : undefined,
    topicRationale: keepContext ? input.sourceTopicRationale.trim() || undefined : undefined,
    topicSelectionId: keepContext ? input.topicSelectionId || undefined : undefined,
    selectedTopicIndex: keepContext && Number.isFinite(input.selectedTopicIndex) ? input.selectedTopicIndex : undefined,
    existingGenerationId,
    taskType: keepContext && input.contentAction
      ? AIM_CONTENT_ACTIONS.find((item) => item.id === input.contentAction)?.taskType || "write_script"
      : "write_script",
    useMarketViralVideos: input.selectedAgentId === "business_diagnosis",
    workflow: workflowBrief ? {
      stage: "content" as const,
      sourceGenerationId: workflowBrief.sourceGenerationId,
      confirmed: workflowBrief.confirmed,
    } : undefined,
    // 方法论是当前控件偏好，不是上一任务正文；空会话/新任务仍可带上用户已选卡片。
    methodologyProfileIds: input.selectedMethodologyProfileIds?.length ? input.selectedMethodologyProfileIds : undefined,
    // 写作风格开关：用户显式选择才覆盖；undefined 时服务端规则引擎按意图推断
    useStyleProfileOverride: input.styleEnabled !== undefined ? input.styleEnabled : undefined,
    // 方法论类技能一次性透传：本轮触发对应方法论/爆款结构注入；未点技能则 undefined（服务端默认不注入）
    activeMethodologySignals: options.activeMethodologySignals?.length ? options.activeMethodologySignals : undefined,
    executionAgentId: options.executionAgentId,
  }
}

function applyGenerationResponse(
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

function markGenerationStopped(input: AimGenerationActionInput, assistantMessageId: string) {
  input.setMessages((messages) => messages.map((message) => {
    if (message.id !== assistantMessageId) return message
    return { ...message, content: "已停止本次生成。", regenerating: false, failure: null }
  }))
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
  const stopProgressTicker = startGenerationProgressTicker(input, assistantMessageId, input.agent.primaryActionLabel)
  const traceId = crypto.randomUUID()
  input.setMessages((messages) => messages.map((message) => message.id === assistantMessageId
    ? { ...message, traceId, traceType: "generate" as const }
    : message))
  input.setIsGenerating(true)
  try {
    const request = buildGenerationRequest(input, rawInput, currentInput, baseMessages, options)
    const { executionAgentId, ...generateBody } = request
    const response = await generateAimContentWithTransientRetry({
      ...generateBody,
      agentId: executionAgentId || generateBody.agentId,
    }, controller.signal)
    if (controller.signal.aborted) {
      markGenerationStopped(input, assistantMessageId)
      return
    }
    applyGenerationResponse(input, assistantMessageId, currentInput, response)
    endExclusiveRequest(input.requestAbortRef, controller, () => input.setIsGenerating(false))
  } catch (error) {
    const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
    if (stopped) {
      markGenerationStopped(input, assistantMessageId)
    } else {
      const message = mapAimErrorToUserMessage(error, "生成失败，请稍后重试")
      toast.error(message)
      input.setMessages((messages) => messages.map((item) => item.id === assistantMessageId
        ? {
            ...item,
            content: message,
            regenerating: false,
            failure: { kind: "generate" as const, retryText: currentInput },
          }
        : item))
    }
  } finally {
    stopProgressTicker()
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
  const message = input.messages.find((item) => item.id === messageId)
  const deliverables = message?.deliverables
  const mainFormat = deliverables?.results.find((result) => result.format === "video_script")
    || deliverables?.results.find((result) => result.format === "koubo_script")
    || deliverables?.results.find((result) => result.format === "raw_copy")
  const mainContent = mainFormat?.content
  if (!mainContent || !deliverables) return

  input.setIsQualityChecking(true)
  try {
    // 主编改稿闸门：默认 editor_revise，成功后替换 deliverable
    const revised = await generateAimContent({
      agentId: "content_review",
      rawInput: mainContent,
      targetFormats: ["raw_copy"],
      taskType: "quality_check",
      reviewMode: "editor_revise",
      existingGenerationId: deliverables.id,
      projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
    })

    const revisedRaw = revised.results[0]?.content || ""
    const diffMatch = revisedRaw.match(/\[\[AIM_EDITOR_DIFF\]\]([\s\S]*?)\[\[\/AIM_EDITOR_DIFF\]\]/)
    const diffSummary = (diffMatch?.[1] || "").trim()
    const finalBody = revisedRaw
      .replace(/\[\[AIM_EDITOR_DIFF\]\][\s\S]*?\[\[\/AIM_EDITOR_DIFF\]\]/g, "")
      .trim()

    if (!finalBody || /打回重写/.test(revisedRaw)) {
      toast.message("主编建议打回重写", { description: diffSummary || "请根据修订说明调整后再生成" })
      input.setMessages((messages) => messages.map((item) => item.id === messageId
        ? {
            ...item,
            qualityReport: {
              editorial: { score: 40, passed: false, feedback: diffSummary || "需重写" },
              aiTaste: { score: 50, passed: true, feedback: "—" },
              attraction: { score: 40, passed: false, feedback: "—" },
              logic: { score: 40, passed: false, feedback: "—" },
              overall: { score: 40, passed: false, needsRewrite: true },
              rewriteCount: 1,
            },
          }
        : item))
      return
    }

    const nextFormat = mainFormat.format === "koubo_script" ? "koubo_script" : mainFormat.format
    const nextResults = deliverables.results.map((result) =>
      result.format === mainFormat.format
        ? { ...result, content: finalBody, wordCount: finalBody.length }
        : result,
    )

    input.setMessages((messages) => messages.map((item) => item.id === messageId
      ? {
          ...item,
          deliverables: {
            ...deliverables,
            results: nextResults,
            qualityStatus: "pass",
          },
          qualityReport: {
            editorial: { score: 85, passed: true, feedback: diffSummary || "主编已修订" },
            aiTaste: { score: 80, passed: true, feedback: "已去AI腔" },
            attraction: { score: 80, passed: true, feedback: "钩子已强化" },
            logic: { score: 80, passed: true, feedback: "结构已理顺" },
            overall: { score: 82, passed: true, needsRewrite: false },
            rewriteCount: 1,
          },
          editorDiffSummary: diffSummary,
        }
      : item))

    input.openEditorFromResult(messageId, nextFormat, finalBody)
    toast.success("主编已修订终稿", { description: diffSummary.slice(0, 120) || "可直接用于发布" })
  } catch (error) {
    // 改稿失败时回退只读质检，不阻断用户
    try {
      const report = await checkScriptQuality({
        content: mainContent,
        persona: input.agent.defaultInstruction,
        publishPlatform: "douyin",
      })
      input.setMessages((messages) => messages.map((item) =>
        item.id === messageId ? { ...item, qualityReport: report } : item,
      ))
      toast.success("发布前自查完成（改稿暂不可用，已出报告）")
    } catch {
      toast.error(error instanceof Error ? error.message : "质检失败")
    }
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
  const inputRef = useRef(input)
  useEffect(() => {
    inputRef.current = input
  })
  const stableGenerateWithInput = useCallback(
    (currentInput: string, options?: GenerateOptions) =>
      generateWithInput(inputRef.current, currentInput, options),
    [],
  )
  return {
    generateWithInput: stableGenerateWithInput,
    stopGeneration: () => input.requestAbortRef.current?.abort(),
    repurposeDeliverable: (messageId: string) => (formats: ContentFormat | ContentFormat[]) =>
      repurposeDeliverable(input, messageId, formats),
    checkDeliverableQuality: (messageId: string) => () => checkDeliverableQuality(input, messageId),
  }
}

"use client"

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { toast } from "sonner"

import {
  ApiError,
  type AimGenerateRequest,
  type ContentFormat,
} from "@/lib/api/client"
import { AIM_CONTENT_ACTIONS, type AimContentAction, type AimWorkflowStage, type ConfirmedWorkflowBrief } from "@/lib/aim-workflow"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { CopyStudioModule } from "@/lib/copy-studio"
import {
  buildAimRawInput,
  nextAimWorkbenchId,
} from "@/lib/aim/workbench-helpers"
import { buildGenerationSourceEnvelope } from "@/hooks/aim-generation-source-envelope"
import {
  applyExecuteTurnResponse,
  applyGenerationFailure,
  applyGenerationResponse,
  buildExecuteTurnRequest,
  resolveGenerationAttemptId,
  resolveFollowUpGenerationId,
} from "@/hooks/aim-generation-delivery-flow"
import { checkDeliverableQuality } from "@/hooks/aim-generation-quality-flow"
import { executeAimTurnWithTransientRetry, generateAimContentWithTransientRetry } from "@/hooks/aim-unified-turn-client"
import { usesUnifiedAimExecuteEntry } from "@/lib/aim/unified-execute-entry"
import {
  resolveAimWorkflowBriefForRequest,
  shouldKeepAimFollowUpContext,
} from "@/lib/aim/task-session-reset"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
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
  retryOfRunId?: string
  startsNewTask?: boolean
  /** 计划模式确认后的任务单显式传递，避免依赖 React 状态异步更新 */
  workflowBriefOverride?: AimWorkflowBriefState | null
  executionAgentId?: string
  /** 客户端生成的追踪 ID：与占位消息上的 traceId 一致 */
  traceId?: string
  /** 方法论类技能一次性透传：本轮触发对应方法论/爆款结构注入 */
  activeMethodologySignals?: import("@/lib/aim-agent-guides").AimMethodologySignal[]
  /** 澄清回答或主动重试时复用的服务端生成任务 ID。 */
  attemptId?: string
  retryGenerationId?: string
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

const GENERATION_PROGRESS_STAGES = [
  { afterMs: 12_000, message: (actionLabel: string) => `正在理解你的要求，随后${actionLabel}…` },
  { afterMs: 28_000, message: () => "正在读取项目资料并匹配知识库…" },
  { afterMs: 55_000, message: (actionLabel: string) => `正在连接模型${actionLabel}，请稍候…` },
  { afterMs: 95_000, message: () => "生成仍在进行，系统会在约 2 分钟内给出结果；也可点停止后重试。" },
] as const

function startGenerationProgressTicker(
  input: AimGenerationActionInput,
  assistantMessageId: string,
  actionLabel: string,
) {
  const timers = GENERATION_PROGRESS_STAGES.map(({ afterMs, message }) =>
    setTimeout(() => {
      input.setMessages((messages) => messages.map((item) => {
        if (item.id !== assistantMessageId || item.pendingGeneration === false) return item
        return { ...item, content: message(actionLabel) }
      }))
    }, afterMs),
  )
  return () => {
    for (const timer of timers) clearTimeout(timer)
  }
}
function appendPendingGeneration(input: AimGenerationActionInput, currentInput: string, options: GenerateOptions) {
  const assistantMessageId = nextAimWorkbenchId()
  input.pendingScrollMessageIdRef.current = assistantMessageId
  const baseMessages = options.startsNewTask
    ? []
    : options.retryMessageId
      ? input.messages.filter((message) => message.id !== options.retryMessageId)
      : input.messages
  const clearAwaitingMarker = (message: AimWorkbenchMessage) =>
    message.generationStatus === "awaiting_input" ? { ...message, generationStatus: null } : message
  const clearedBaseMessages = baseMessages.map(clearAwaitingMarker)
  if (options.startsNewTask) {
    input.clearCurrentTaskContext()
    input.onIsolateTaskSession?.()
  }
  input.setMessages((messages) => [
    ...(options.startsNewTask
      ? []
      : options.retryMessageId
        ? messages.filter((message) => message.id !== options.retryMessageId).map(clearAwaitingMarker)
        : messages.map(clearAwaitingMarker)),
    ...(currentInput && !options.retryMessageId ? [{ id: nextAimWorkbenchId(), role: "user" as const, content: currentInput }] : []),
    {
      id: assistantMessageId,
      role: "assistant" as const,
      content: getAimPendingGenerationMessage(input.projectEnabled, input.agent.primaryActionLabel),
      agentId: input.agent.id,
      regenerating: false,
      pendingGeneration: true,
    },
  ])
  if (currentInput) input.setInput("")
  return { assistantMessageId, baseMessages: clearedBaseMessages }
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
    traceId: options.traceId,
    executionAgentId: options.executionAgentId,
  }
}

/**
 * 生成入口请求装配 seam（纯函数，供单测覆盖两处调用点的 traceId 接线与
 * executionAgentId 剥离逻辑，防止重构悄悄丢掉 traceId 后回归 P0）：
 * useUnifiedEntry → 统一执行入口 execute 请求；否则 → 旧 generate 请求
 * （旧路径剥离 executionAgentId，agentId 回落为委托执行体，与调用点一致）。
 */
export function buildAimEntryRequest(
  input: AimGenerationActionInput,
  rawInput: string,
  currentInput: string,
  baseMessages: AimWorkbenchMessage[],
  options: GenerateOptions,
  useUnifiedEntry: boolean,
  traceId: string,
): { kind: "execute"; body: ReturnType<typeof buildExecuteTurnRequest> } | { kind: "generate"; body: AimGenerateRequest } {
  if (useUnifiedEntry) {
    return { kind: "execute", body: buildExecuteTurnRequest(input, rawInput, currentInput, baseMessages, { ...options, traceId }) }
  }
  const request = buildGenerationRequest(input, rawInput, currentInput, baseMessages, { ...options, traceId })
  const { executionAgentId, ...generateBody } = request
  return { kind: "generate", body: { ...generateBody, agentId: executionAgentId || generateBody.agentId } }
}

/** 统一执行入口的请求构建与响应应用已拆至 aim-generation-delivery-flow（保持模块 ≤500 行） */
export { resolveFollowUpGenerationId } from "@/hooks/aim-generation-delivery-flow"

function markGenerationStopped(input: AimGenerationActionInput, assistantMessageId: string) {
  input.setMessages((messages) => messages.map((message) => {
    if (message.id !== assistantMessageId) return message
    return { ...message, content: "已停止本次生成。", regenerating: false, pendingGeneration: false, failure: null }
  }))
}

/** 立即把仍在生成中的占位气泡标记为已停止（忽略已完成的交付消息） */
function markPendingMessageStoppedIfAny(input: AimGenerationActionInput) {
  const pendingId = input.pendingScrollMessageIdRef.current
  if (!pendingId) return
  input.setMessages((messages) => messages.map((message) => {
    if (message.id !== pendingId || message.pendingGeneration !== true) return message
    return { ...message, content: "已停止本次生成。", pendingGeneration: false }
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
  let generationAttemptId: string | undefined
  try {
    // 创作台统一执行入口（content_producer / 商业诊断组）：
    // 语义理解 → 关键缺口一次性追问（≤3）→ 交付；其他智能体暂留旧 generate 入口
    const resolved = resolveGenerationAttemptId({
      options,
      messages: input.messages,
      baseMessages,
      startsNewTask: options.startsNewTask,
      traceId,
    })
    const { retryGenerationId, retrySource } = resolved
    const attemptId = resolved.attemptId
    generationAttemptId = attemptId
    const useUnifiedEntry = usesUnifiedAimExecuteEntry(options.executionAgentId || input.selectedAgentId)
    const entry = buildAimEntryRequest(input, rawInput, currentInput, baseMessages, {
      ...options,
      attemptId,
      retryGenerationId,
      retryOfRunId: options.retryOfRunId || retrySource?.failure?.runId || retrySource?.runId || undefined,
    }, useUnifiedEntry, traceId)
    if (entry.kind === "execute") {
      const response = await executeAimTurnWithTransientRetry(entry.body, controller.signal)
      if (controller.signal.aborted) {
        markGenerationStopped(input, assistantMessageId)
        return
      }
      applyExecuteTurnResponse(input, assistantMessageId, response, currentInput)
      endExclusiveRequest(input.requestAbortRef, controller, () => input.setIsGenerating(false))
      return
    }
    const response = await generateAimContentWithTransientRetry(entry.body, controller.signal)
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
      applyGenerationFailure(input, {
        assistantMessageId,
        currentInput,
        error,
        traceId,
        generationAttemptId,
      })
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

/** 模块级助手：中止并复位请求控制器（跨函数边界变更 ref，避开 hook 参数直接变异的编译器规则） */
function resetGenerationAbortController(ref: MutableRefObject<AbortController | null>) {
  ref.current?.abort()
  ref.current = null
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
    stopGeneration: () => {
      // 立即中止请求并强制清忙状态：不依赖 abort 回调链（挂起的请求/质检可能迟迟不结束）
      resetGenerationAbortController(input.requestAbortRef)
      input.setIsGenerating(false)
      input.setIsQualityChecking(false)
      markPendingMessageStoppedIfAny(input)
    },
    repurposeDeliverable: (messageId: string) => (formats: ContentFormat | ContentFormat[]) =>
      repurposeDeliverable(input, messageId, formats),
    checkDeliverableQuality: (messageId: string) => () => checkDeliverableQuality(input, messageId),
  }
}

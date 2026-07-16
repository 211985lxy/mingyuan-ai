"use client"

import { useState, useMemo, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import { IpWikiDialog } from "./ip-wiki-dialog"
import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { AimProjectTaskPanel } from "@/components/aim/aim-project-task-panel"
import { BenchmarkEditorPanel, type AimEditorSelection } from "@/components/aim/benchmark-editor-panel"
import { AimMessageStream } from "@/components/aim/aim-message-stream"
import { AimEvolutionSuggestions, AimProjectNotices, AimWorkbenchHeader } from "@/components/aim/aim-workbench-chrome"
import { WorkflowBriefDialog } from "@/components/aim/workflow-brief-dialog"
import {
  WorkflowRecordDialog,
} from "@/components/aim/workflow-record-dialog"
import {
  generateAimContent,
  checkScriptQuality,
  uploadImageForAimChat,
  chatAimStream,
  createKnowledge,
  createAimWorkflowBrief,
  evolveAimConversation,
  evolveStyleConversation,
  ApiError,
  type AimEvolutionSuggestion,
  type AimGenerateResponse,
  type ContentFormat,
} from "@/lib/api/client"
import {
  AIM_CONTENT_ACTIONS,
  AIM_WORKFLOW_STAGES,
  getWorkflowStageForAgent,
  isAimWorkflowStage,
  type AimContentAction,
  type AimWorkflowStage,
  type ConfirmedWorkflowBrief,
} from "@/lib/aim-workflow"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { useAimProjectWorkspace } from "@/hooks/use-aim-project-workspace"
import { useAimWorkflowRecords } from "@/hooks/use-aim-workflow-records"
import { useAimEditorActions } from "@/hooks/use-aim-editor-actions"
import { useAimDraftAutosave, useAimMessageAutoScroll, useAimSourceHydration } from "@/hooks/use-aim-workbench-effects"
import { useAimAgentDraftSwitch, useAimHistoryLoad, useAimTopicPrefill, useAimVideoCopyPrefill } from "@/hooks/use-aim-route-sync"
import { transcribeAudio } from "@/lib/api/client"
import {
  AIM_AGENT_OPTIONS,
  DEFAULT_AIM_AGENT,
  isValidAimAgent,
  type AimAgentId,
  type AimAgentMeta,
} from "@/lib/aim-ui-config"
import {
  buildAimNextActionPrompt,
  getAimAgentGuide,
  type AimAgentGuide,
  type AimNextAction,
  type AimWorkbenchSkill,
} from "@/lib/aim-agent-guides"
import { useAimWorkspaceStore } from "@/lib/aim-workspace-store"
import {
  detectAimWorkbenchCommand,
  shouldIsolateWritingInstruction,
  type AimWorkbenchCommand,
} from "@/lib/aim-workbench-commands"
import {
  EDITOR_PANEL_DEFAULT_WIDTH,
  applyFirstMatchingStructureToReference,
  type AimEditorContext,
  type TextSelectionRange,
} from "@/lib/aim-editor"
import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"
import {
  AIM_ACTIVE_SOFT_ACTION_CLASS as ACTIVE_SOFT_ACTION_CLASS,
  AIM_FORMAT_LABELS as FORMAT_LABELS,
} from "@/lib/aim/workbench-display"
import { reportAimRunEvent } from "@/lib/aim/run-events"
import { buildAimChatMessages, runAimChatRequest } from "@/lib/aim/chat-request"
import { proofreadAimResponse } from "@/lib/aim/generation-proofread"
import { clearAimDraft, loadAimDraft, type AimDraft } from "@/lib/aim/draft-storage"
import {
  buildAimHistoryRawInput as buildHistoryRawInput,
  buildAimEditorContext,
  buildAimBenchmarkQualityMessage,
  buildAimBenchmarkRewriteInput,
  buildAimRawInput,
  detectAimLarkToolAction,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  extractPersonaProgress as extractProgress,
  findLatestAimDeliverableId,
  findLatestAimVideoDeliverableMessageId,
  nextAimWorkbenchId as nextId,
  prepareAimChatTurn as prepareChatTurn,
  reportAimChatRevision as reportChatRevision,
} from "@/lib/aim/workbench-helpers"
import {
  type AimImageAttachment,
  type IpWikiDialogContext,
  type AimWorkbenchMessage as ChatMessage,
} from "@/lib/aim/workbench-types"

interface AimAgentOption extends AimAgentMeta, AimAgentGuide {}

const AGENT_OPTIONS: AimAgentOption[] = AIM_AGENT_OPTIONS.map((meta) => ({
  ...meta,
  ...getAimAgentGuide(meta.id),
}))

const RESEARCH_HINT_AGENT_IDS = new Set<AimAgentId>(["business_system_diagnosis", "business_diagnosis"])

interface SendTextOptions {
  editorContext?: AimEditorContext
  editorApplyRange?: TextSelectionRange
  images?: AimImageAttachment[]
  retryMessageId?: string
}

export default function AimPage() {
  const router = useRouter()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const agentParam = searchParams.get("agent")
  const workflowStageParam = searchParams.get("stage")
  const topicTitleParam = searchParams.get("topicTitle")
  const topicRationaleParam = searchParams.get("topicRationale")
  const topicSelectionIdParam = searchParams.get("topicSelectionId")
  // 注意：searchParams.get 缺省返回 null，Number(null)===0 会误把「未选选题」记成第 0 号。
  // 仅当参数确实存在且为非负整数时才解析，否则 NaN（下游 Number.isFinite 会丢弃）。
  const selectedTopicIndexRaw = searchParams.get("selectedTopicIndex")
  const selectedTopicIndexParam =
    selectedTopicIndexRaw !== null && /^\d+$/.test(selectedTopicIndexRaw) ? Number(selectedTopicIndexRaw) : NaN
  const projectIdParam = searchParams.get("projectId")
  const videoCopyExtractionIdParam = searchParams.get("videoCopyExtractionId")
  const modeParam = searchParams.get("mode")
  const ideaParam = searchParams.get("idea")
  const activeAgentId: AimAgentId = isValidAimAgent(agentParam) ? agentParam : DEFAULT_AIM_AGENT
  const [initialDraft] = useState<AimDraft | null>(() => loadAimDraft(activeAgentId))
  const [selectedAgentId, setSelectedAgentId] = useState<AimAgentId>(() => agentParam ? activeAgentId : initialDraft?.selectedAgentId || activeAgentId)
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialDraft?.messages || [])
  const [input, setInput] = useState(() => initialDraft?.input || "")
  const [imageAttachments, setImageAttachments] = useState<AimImageAttachment[]>([])
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [sourceVideoCopyExtractionId, setSourceVideoCopyExtractionId] = useState<string | undefined>(() => initialDraft?.videoCopyExtractionId)
  const [sourceOriginalText, setSourceOriginalText] = useState(() => initialDraft?.sourceOriginalText || "")
  const [sourceAnalysisText, setSourceAnalysisText] = useState(() => initialDraft?.sourceAnalysisText || "")
  const [sourceTopicTitle, setSourceTopicTitle] = useState(() => initialDraft?.sourceTopicTitle || "")
  const [sourceTopicRationale, setSourceTopicRationale] = useState(() => initialDraft?.sourceTopicRationale || "")
  const [editorText, setEditorText] = useState(() => initialDraft?.editorText || "")
  const [editorFormat, setEditorFormat] = useState<ContentFormat | undefined>(() => initialDraft?.editorFormat)
  const [editorSourceMessageId, setEditorSourceMessageId] = useState<string | undefined>(() => initialDraft?.editorSourceMessageId)
  const [editorPanelWidth, setEditorPanelWidth] = useState(() => initialDraft?.editorPanelWidth ?? EDITOR_PANEL_DEFAULT_WIDTH)
  const [editorPanelOpen, setEditorPanelOpen] = useState(() => initialDraft?.editorPanelOpen ?? true)
  const [referenceSelection, setReferenceSelection] = useState<AimEditorSelection>({ text: "", range: { start: 0, end: 0 } })
  const [draftSelection, setDraftSelection] = useState<AimEditorSelection>({ text: "", range: { start: 0, end: 0 } })
  const [isThinking, setIsThinking] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isQualityChecking, setIsQualityChecking] = useState(false)
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    projectEnabled,
    setProjectEnabled,
    projectWorkflowRecords,
    isLoadingProjectWorkflow,
    refreshProjectWorkflow,
  } = useAimProjectWorkspace(initialDraft?.selectedProjectId || "")
  const [wikiDialog, setWikiDialog] = useState<{ open: boolean; context: IpWikiDialogContext | null }>({
    open: false,
    context: null,
  })
  const [workflowBrief, setWorkflowBrief] = useState<{
    sourceGenerationId?: string
    nextInput: string
    confirmed: ConfirmedWorkflowBrief
  } | null>(null)
  const [workflowBriefForm, setWorkflowBriefForm] = useState<ConfirmedWorkflowBrief>({})
  const [workflowBriefDialogOpen, setWorkflowBriefDialogOpen] = useState(false)
  const [isBuildingWorkflowBrief, setIsBuildingWorkflowBrief] = useState(false)
  const [contentAction, setContentAction] = useState<AimContentAction | null>(null)
  const [isEvolving, setIsEvolving] = useState(false)
  const [evolutionSuggestions, setEvolutionSuggestions] = useState<AimEvolutionSuggestion[]>([])

  // 历史记录由侧边栏共享 store 管理（侧边栏渲染列表、生成成功后刷新、点击后触发加载）
  const storeHistory = useAimWorkspaceStore((s) => s.history)
  const loadTargetId = useAimWorkspaceStore((s) => s.loadTargetId)
  const refreshHistory = useAimWorkspaceStore((s) => s.fetchHistory)
  const clearLoadTarget = useAimWorkspaceStore((s) => s.clearLoadTarget)
  const requestLoad = useAimWorkspaceStore((s) => s.requestLoad)
  const {
    recordDialog,
    closeRecordDialog,
    decisionForm,
    setDecisionForm,
    publishForm,
    setPublishForm,
    retroForm,
    setRetroForm,
    outcomeForm,
    setOutcomeForm,
    outcomeWindow,
    setOutcomeWindow,
    retroRuleForm,
    setRetroRuleForm,
    handleMarkStatus,
    openRecordDialog,
    submitRecordDialog,
  } = useAimWorkflowRecords({
    messages,
    selectedAgentId,
    selectedProjectId,
    refreshHistory,
    refreshProjectWorkflow,
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const requestAbortRef = useRef<AbortController | null>(null)
  const pendingScrollMessageIdRef = useRef<string | null>(null)

  const agent = useMemo(() => {
    const baseAgent = AGENT_OPTIONS.find((a) => a.id === selectedAgentId)!
    if (selectedAgentId === "content_producer" && modeParam === "asset_pack") {
      const isHotTopicAsset = sourceTopicTitle.trim().length > 0 && !sourceVideoCopyExtractionId
      return {
        ...baseAgent,
        title: "内容文案创作 · 内容资产包",
        intro: "这里是内容文案创作的资产包模式。先生成短视频脚本，拍摄交接单、朋友圈、社群运营、公众号文章可按需点击派生。",
        placeholder: isHotTopicAsset
          ? "这个热点要怎么讲？补充你的观点、客户场景或产品承接，我先生成主脚本..."
          : "说说今天要生产什么内容：选题、原始想法、老板口述、客户问题都可以，我先生成主脚本...",
        defaultFormats: ["video_script" as const],
        quickPrompts: [
          "把这个选题先生成短视频脚本。",
          "基于老板的这段金句，先输出一版可拍脚本。",
        ],
        primaryActionLabel: "生成口播文案",
      }
    }
    if (selectedAgentId === "content_producer") {
      return {
        ...baseAgent,
        title: "内容文案创作 · 单篇创作",
        defaultFormats: ["video_script" as const],
        placeholder: "粘贴选题、原始想法、老板口述、现有文案或爆款拆解，我来生成可发布内容…",
        primaryActionLabel: "生成口播文案",
      }
    }
    return baseAgent
  }, [modeParam, selectedAgentId, sourceTopicTitle, sourceVideoCopyExtractionId])

  const editorPanelLabels = useMemo(
    () => getAimEditorPanelLabels(selectedAgentId, editorFormat),
    [editorFormat, selectedAgentId],
  )

  const currentWorkflowStage = isAimWorkflowStage(workflowStageParam)
    ? workflowStageParam
    : getWorkflowStageForAgent(selectedAgentId)
  const showWorkflowLanding = !agentParam && !workflowStageParam && messages.length === 0 && !input.trim() && !ideaParam

  const hasEditorSelection = Boolean(referenceSelection.text.trim() || draftSelection.text.trim())

  const analysisTextCandidates = useMemo(() => {
    const candidates = []
    if (sourceAnalysisText.trim()) candidates.push(sourceAnalysisText)
    const inputAnalysis = extractBenchmarkAnalysisText(input)
    if (inputAnalysis) candidates.push(inputAnalysis)
    for (const message of [...messages].reverse()) {
      if (message.role !== "user") continue
      const messageAnalysis = extractBenchmarkAnalysisText(message.content)
      if (messageAnalysis) candidates.push(messageAnalysis)
    }
    return candidates
  }, [input, messages, sourceAnalysisText])

  const annotatedReferenceText = useMemo(
    () => applyFirstMatchingStructureToReference(sourceOriginalText, analysisTextCandidates),
    [analysisTextCandidates, sourceOriginalText],
  )

  const { isRecording, isTranscribing, startRecording, stopRecording } = useAudioRecorder({
    transcribeFn: transcribeAudio,
    onTranscribeSuccess: (text) => setInput((prev) => (prev ? `${prev}\n${text}` : text)),
  })

  const {
    isImitating,
    imitateStyleId,
    setImitateStyleId,
    handleImitate,
    fillReferenceFromConversation: fillReferenceTextFromConversation,
    integrateAssistantDraft: integrateLatestAssistantDraftToEditor,
    saveEditorToDeliverable,
    optimizeOpening: handleOptimizeOpening,
    reviseCurrentDraft: handleReviseCurrentDraft,
    applyEditorReplacement,
  } = useAimEditorActions({
    messages,
    setMessages,
    setInput,
    sourceOriginalText,
    setSourceOriginalText,
    sourceTopicTitle,
    editorText,
    setEditorText,
    editorFormat,
    editorSourceMessageId,
    setEditorPanelOpen,
    referenceSelection,
    draftSelection,
    labels: editorPanelLabels,
    agentDefaultInstruction: agent.defaultInstruction,
    selectedProjectId,
    projectEnabled,
    selectedAgentId,
    requestAbortRef,
    setIsGenerating,
    setIsThinking,
  })

  const lastAgentParamRef = useRef(agentParam)
  const routeSetters = useMemo(() => ({
    setSelectedAgentId,
    setSelectedProjectId,
    setMessages,
    setInput,
    setSourceVideoCopyExtractionId,
    setSourceOriginalText,
    setSourceAnalysisText,
    setSourceTopicTitle,
    setSourceTopicRationale,
    setEditorText,
    setEditorFormat,
    setEditorSourceMessageId,
    setEditorPanelWidth,
    setEditorPanelOpen,
  }), [setSelectedProjectId])

  useAimDraftAutosave({
    selectedAgentId,
    selectedProjectId,
    input,
    messages,
    videoCopyExtractionId: sourceVideoCopyExtractionId,
    sourceOriginalText,
    sourceAnalysisText,
    sourceTopicTitle,
    sourceTopicRationale,
    editorText,
    editorFormat,
    editorSourceMessageId,
    editorPanelWidth,
    editorPanelOpen,
  })
  useAimSourceHydration({
    extractionId: sourceVideoCopyExtractionId,
    sourceOriginalText,
    sourceAnalysisText,
    setSourceOriginalText,
    setSourceAnalysisText,
  })

  useAimAgentDraftSwitch({ agentParam, activeAgentId, selectedProjectId, lastAgentParamRef, setters: routeSetters })
  useAimTopicPrefill({
    topicTitle: topicTitleParam,
    topicRationale: topicRationaleParam,
    projectId: projectIdParam,
    idea: ideaParam,
    router,
    searchParams,
    setters: routeSetters,
  })
  useAimVideoCopyPrefill({ extractionId: videoCopyExtractionIdParam, router, searchParams, setters: routeSetters })

  const openEditorFromResult = useCallback((messageId: string, format: ContentFormat, content: string) => {
    setEditorText(content)
    setEditorFormat(format)
    setEditorSourceMessageId(messageId)
    setEditorPanelOpen(true)
    setDraftSelection({ text: "", range: { start: 0, end: 0 } })
  }, [])

  useAimHistoryLoad({
    loadTargetId,
    history: storeHistory,
    selectedAgentId,
    router,
    searchParams,
    lastAgentParamRef,
    clearLoadTarget,
    openEditorFromResult,
    setters: routeSetters,
  })

  useAimMessageAutoScroll({ scrollRef, pendingMessageIdRef: pendingScrollMessageIdRef, messages, isThinking, isGenerating })

  /** 人设故事梳理：取最近一条助手回复的【进度 XX%】驱动顶部进度条 */
  const personaProgress = useMemo(() => {
    if (agent.id !== "persona") return null
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
    return lastAssistant ? extractProgress(lastAssistant.content) : null
  }, [messages, agent.id])

  function clearCurrentTaskContext() {
    setSourceVideoCopyExtractionId(undefined)
    setSourceOriginalText("")
    setSourceAnalysisText("")
    setSourceTopicTitle("")
    setSourceTopicRationale("")
    setEditorText("")
    setEditorFormat(undefined)
    setEditorSourceMessageId(undefined)
  }

  function resetConversation() {
    requestAbortRef.current?.abort()
    setMessages([])
    setInput("")
    clearCurrentTaskContext()
    clearAimDraft(selectedAgentId)
  }

  async function handleAddImages(files: FileList) {
    const nextImages: AimImageAttachment[] = []
    setIsUploadingImage(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} 不是图片文件`)
          continue
        }
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} 超过 8MB`)
          continue
        }
        const uploaded = await uploadImageForAimChat(file)
        nextImages.push({
          id: nextId("img"),
          name: file.name,
          assetUrl: uploaded.assetUrl,
          readUrl: uploaded.readUrl,
          previewUrl: uploaded.readUrl,
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片上传失败")
    } finally {
      setIsUploadingImage(false)
    }
    if (nextImages.length) setImageAttachments((current) => [...current, ...nextImages].slice(-4))
  }

  function rememberWorkbenchPreference(input: string) {
    const contextMessages = [
      ...messages.map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: input },
    ].filter((message) => message.content.trim()).slice(-8)

    if (contextMessages.length === 0) {
      toast.error("没有可沉淀的偏好内容")
      return
    }

    setIsEvolving(true)
    void evolveStyleConversation({ messages: contextMessages })
      .then((result) => {
        if (result.profile) {
          toast.success(result.created ? "已建立全局写作风格档案" : "全局写作风格档案已更新")
        } else if (result.reason === "no_style") {
          toast.info("这句话还没有形成稳定偏好")
        } else {
          toast.info(result.reason || "这句话没有形成稳定偏好")
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "偏好沉淀失败")
      })
      .finally(() => setIsEvolving(false))
  }

  function runWorkbenchCommand(command: AimWorkbenchCommand) {
    setInput("")

    if (command.id === "integrate_editor") return integrateLatestAssistantDraftToEditor()
    if (command.id === "fill_reference") return fillReferenceTextFromConversation()
    if (command.id === "open_editor") {
      setEditorPanelOpen(true)
      toast.success(`已打开右侧${editorPanelLabels.title}`)
      return true
    }
    if (command.id === "close_editor") {
      setEditorPanelOpen(false)
      toast.success(`已隐藏右侧${editorPanelLabels.title}`)
      return true
    }
    if (command.id === "save_editor") return saveEditorToDeliverable()
    if (command.id === "reset_conversation") {
      resetConversation()
      toast.success("已清空当前对话")
      return true
    }
    if (command.id === "regenerate") {
      void generateWithInput("")
      return true
    }
    if (command.id === "revise_current_draft") return handleReviseCurrentDraft(command.input)
    if (command.id === "optimize_opening") return handleOptimizeOpening(command.input)
    if (command.id === "rewrite_benchmark") {
      const rewriteInput = buildAimBenchmarkRewriteInput({ messages, sourceOriginalText, sourceAnalysisText, editorText })
      if (!rewriteInput) toast.error("请先带入对标原文")
      if (rewriteInput) void generateWithInput(rewriteInput)
      return true
    }
    if (command.id === "run_quality_check") {
      const localCheckMessage = buildAimBenchmarkQualityMessage({ messages, sourceOriginalText, editorText })
      const messageId = findLatestAimVideoDeliverableMessageId(messages)
      if (localCheckMessage) {
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: localCheckMessage }])
      }
      if (messageId) {
        void handleQuality(messageId)()
        toast.success(localCheckMessage ? "已完成对标自检，并开始脚本质检" : "已开始脚本质检")
        return true
      }
      if (localCheckMessage) {
        toast.success("对标自检完成")
        return true
      }
      toast.error("当前没有可质检的生成结果")
      return true
    }
    if (command.id === "remember_preference") {
      rememberWorkbenchPreference(command.input)
      return true
    }
    return false
  }

  async function sendText(text: string, options?: SendTextOptions) {
    const images = options?.images ?? []
    if (!text && images.length === 0) return
    const startsNewTask = !options?.retryMessageId && shouldIsolateWritingInstruction(text, messages.length > 0)
    const workbenchCommand = detectAimWorkbenchCommand(text)
    if (!startsNewTask && workbenchCommand && runWorkbenchCommand(workbenchCommand)) return
    reportChatRevision(messages, options?.retryMessageId, startsNewTask)
    const controller = new AbortController()
    requestAbortRef.current = controller
    const { assistantId, thread, pendingMessages } = prepareChatTurn({
      messages,
      text,
      images,
      retryMessageId: options?.retryMessageId,
      startsNewTask,
      editorApplyRange: options?.editorApplyRange,
    })
    if (startsNewTask) clearCurrentTaskContext()
    setMessages(pendingMessages)
    setInput("")
    if (images.length) setImageAttachments([])
    setIsThinking(true)
    try {
      const toolAction = detectAimLarkToolAction(text)
      if (toolAction && projectEnabled && !selectedProjectId) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId ? { ...message, content: "需要先选择 IP 营销全案，才能执行这个飞书同步动作。" } : message
        ))
        return
      }
      const resultId = toolAction === "export_lark_generation" ? findLatestAimDeliverableId(messages) : undefined
      if (toolAction === "export_lark_generation" && !resultId) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId ? { ...message, content: "当前没有可同步到飞书的 AIM 生成结果。" } : message
        ))
        return
      }
      const { hasContent } = await runAimChatRequest({
        messages: buildAimChatMessages(thread),
        agentId: selectedAgentId,
        projectId: projectEnabled ? selectedProjectId || undefined : undefined,
        toolAction,
        resultId,
        editorContext: startsNewTask ? undefined : options?.editorContext,
        signal: controller.signal,
        onContent: (content) => {
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

  async function handleEvolveConversation() {
    const sourceMessages = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content }))

    if (sourceMessages.length < 2) {
      toast.error("对话太少，还没有可沉淀的偏好")
      return
    }

    // 纯文案模式（未启用 IP 全案）也能沉淀全局写作风格；选了项目则同时提炼项目偏好
    const canEvolveProject = projectEnabled && !!selectedProjectId

    setIsEvolving(true)
    try {
      const results = await Promise.allSettled([
        evolveStyleConversation({ messages: sourceMessages }),
        canEvolveProject
          ? evolveAimConversation({ projectId: selectedProjectId, messages: sourceMessages })
          : Promise.resolve<AimEvolutionSuggestion[]>([]),
      ])

      const [styleOutcome, projectOutcome] = results

      if (styleOutcome.status === "fulfilled") {
        const r = styleOutcome.value
        if (r.profile) {
          toast.success(r.created ? "已建立全局写作风格档案" : "全局写作风格档案已更新")
        } else if (r.reason === "no_style") {
          toast.info("这轮对话还没有明显的写作风格可沉淀")
        }
      } else {
        toast.error("写作风格沉淀失败")
      }

      if (projectOutcome.status === "fulfilled") {
        setEvolutionSuggestions(projectOutcome.value)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "偏好提炼失败")
    } finally {
      setIsEvolving(false)
    }
  }

  async function handleSaveEvolutionSuggestion(suggestion: AimEvolutionSuggestion) {
    if (!selectedProjectId) {
      toast.error("请先选择 IP 营销全案")
      return
    }
    try {
      await createKnowledge({
        projectId: selectedProjectId,
        category: suggestion.category,
        title: suggestion.title,
        content: suggestion.content,
        tags: suggestion.tags,
        sourceType: "manual",
      })
      setEvolutionSuggestions((prev) => prev.filter((item) => item !== suggestion))
      toast.success("已沉淀进知识库")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "知识沉淀失败")
    }
  }

  function beginWorkflowStage(stage: AimWorkflowStage) {
    const config = AIM_WORKFLOW_STAGES.find((item) => item.id === stage)!
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set("stage", stage)
    nextParams.set("agent", config.defaultAgentId)
    lastAgentParamRef.current = config.defaultAgentId
    setSelectedAgentId(config.defaultAgentId)
    if (stage !== "content") setContentAction(null)
    if (stage === "results") {
      setInput("请基于已发布内容填写复盘：结果、判断和下一轮可复用规则。")
    }
    router.replace(`/aim?${nextParams.toString()}`)
  }

  function beginContentAction(action: AimContentAction) {
    const config = AIM_CONTENT_ACTIONS.find((item) => item.id === action)!
    setContentAction(action)
    setInput((current) => current.trim() ? `${config.prompt}\n\n${current}` : config.prompt)
    if (selectedAgentId !== "content_producer") beginWorkflowStage("content")
  }

  async function openProjectWorkflowTask(id: string) {
    if (!selectedProjectId) return
    await refreshHistory({ force: true, projectId: selectedProjectId })
    requestLoad(id)
  }

  async function handleAimNextAction(action: AimNextAction, content: string, generationId: string) {
      const cleanContent = content.trim()
      if (!cleanContent) return

      if (action.id === "save_knowledge") {
        if (!selectedProjectId) {
          toast.error("请先选择 IP 营销全案")
          return
        }
        try {
          await createKnowledge({
            projectId: selectedProjectId,
            category: "positioning_material",
            title: `AIM交付物 · ${agent.title}`,
            content: cleanContent,
            tags: ["aim_delivery", action.id],
            sourceType: "manual",
          })
          toast.success("已保存为档案素材")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "保存失败")
        }
        return
      }

      if (action.targetAgentId && action.targetAgentId !== selectedAgentId) {
        if (action.targetAgentId === "content_producer" && getWorkflowStageForAgent(selectedAgentId) === "direction") {
          setIsBuildingWorkflowBrief(true)
          try {
            const brief = await createAimWorkflowBrief({
              stage: "content",
              projectId: selectedProjectId || undefined,
              sourceGenerationId: generationId,
              goal: action.label,
            })
            setWorkflowBriefForm({
              goal: brief.taskSpec.goal,
              targetCustomer: brief.taskSpec.targetCustomer,
              realProblem: brief.taskSpec.realProblem,
              contentTask: brief.taskSpec.contentTask,
              mustKeep: brief.taskSpec.exclusiveEvidence,
              desiredAction: brief.taskSpec.desiredAction,
            })
            setWorkflowBrief({
              sourceGenerationId: brief.sourceGenerationId,
              nextInput: buildAimNextActionPrompt(action, cleanContent),
              confirmed: {},
            })
            setWorkflowBriefDialogOpen(true)
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "任务单创建失败")
          } finally {
            setIsBuildingWorkflowBrief(false)
          }
          return
        }
        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.set("agent", action.targetAgentId)
        nextParams.set("stage", getWorkflowStageForAgent(action.targetAgentId))
        lastAgentParamRef.current = action.targetAgentId
        setSelectedAgentId(action.targetAgentId)
        setMessages([])
        setSourceVideoCopyExtractionId(undefined)
        setSourceOriginalText("")
        setSourceAnalysisText("")
        setSourceTopicTitle("")
        setSourceTopicRationale("")
        setEditorText("")
        setEditorFormat(undefined)
        setEditorSourceMessageId(undefined)
        router.replace(`/aim?${nextParams.toString()}`)
      }
      setInput(buildAimNextActionPrompt(action, cleanContent))
      toast.success("已带入聊天框")
  }

  const handleUseSkill = useCallback((skill: AimWorkbenchSkill) => {
    const hasCurrentContext = Boolean(
      editorText.trim() ||
      sourceOriginalText.trim() ||
      sourceAnalysisText.trim() ||
      sourceTopicTitle.trim() ||
      messages.some((message) => message.role === "assistant" && (message.content.trim() || message.deliverables)),
    )
    const prompt = hasCurrentContext && !skill.prompt.includes("当前")
      ? `请基于当前内容，${skill.prompt.replace(/^请/, "")}`
      : skill.prompt

    setInput((current) => {
      const text = current.trim()
      return text ? `${prompt}\n\n---\n${text}\n---` : prompt
    })
    toast.success("技能指令已填入")
  }, [editorText, messages, sourceAnalysisText, sourceOriginalText, sourceTopicTitle])

  async function handleSend() {
    await sendText(input.trim(), hasEditorSelection ? {
      editorContext: buildAimEditorContext({ action: "用户追问", referenceSelection: referenceSelection.text, draftSelection: draftSelection.text, editorText, labels: editorPanelLabels }),
      editorApplyRange: draftSelection.text.trim() ? draftSelection.range : undefined,
      images: imageAttachments,
    } : { images: imageAttachments })
  }

  function applyGenerationResponse(
    assistantMessageId: string,
    currentInput: string,
    response: AimGenerateResponse,
    correctedResponse: AimGenerateResponse,
  ) {
    const extractedOriginalText = extractBenchmarkOriginalText(currentInput)
    const extractedAnalysisText = extractBenchmarkAnalysisText(currentInput)
    if (extractedOriginalText) setSourceOriginalText(extractedOriginalText)
    if (extractedAnalysisText) setSourceAnalysisText(extractedAnalysisText)
    setMessages((prev) => prev.map((message) => message.id === assistantMessageId ? {
      ...message,
      content: `${agent.title} 交付物已生成，可直接复制使用，也能继续在下方对话里让我改写。`,
      agentId: agent.id,
      deliverables: correctedResponse,
      runId: response.runId ?? null,
      degraded: response.degraded ?? null,
      qualityStatus: response.qualityStatus ?? null,
      workflowStage: currentWorkflowStage,
      contentAction,
    } : message))
    const mainResult = correctedResponse.results[0] ?? response.results[0]
    if (mainResult) openEditorFromResult(assistantMessageId, mainResult.format, mainResult.content)
    refreshHistory({ force: true, agentId: selectedAgentId })
    if (selectedProjectId) void refreshProjectWorkflow()
    setWorkflowBrief(null)
    setContentAction(null)
    toast.success(`${agent.primaryActionLabel}完毕`)
  }

  async function generateWithInput(currentInput: string, options?: { retryMessageId?: string; startsNewTask?: boolean }) {
    const rawInput = options?.startsNewTask
      ? currentInput
      : buildAimRawInput(messages, currentInput || undefined)
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
    const assistantMessageId = nextId()
    pendingScrollMessageIdRef.current = assistantMessageId
    const baseMessages = options?.startsNewTask
      ? []
      : options?.retryMessageId
      ? messages.filter((message) => message.id !== options.retryMessageId)
      : messages
    if (options?.startsNewTask) clearCurrentTaskContext()
    setMessages((prev) => [
      ...(options?.startsNewTask
        ? []
        : options?.retryMessageId
        ? prev.filter((message) => message.id !== options.retryMessageId)
        : prev),
      ...(currentInput && !options?.retryMessageId ? [{ id: nextId(), role: "user" as const, content: currentInput }] : []),
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
        videoCopyExtractionId: options?.startsNewTask ? undefined : sourceVideoCopyExtractionId,
        topicTitle: options?.startsNewTask ? undefined : sourceTopicTitle.trim() || undefined,
        topicRationale: options?.startsNewTask ? undefined : sourceTopicRationale.trim() || undefined,
        topicSelectionId: options?.startsNewTask ? undefined : topicSelectionIdParam || undefined,
        selectedTopicIndex: options?.startsNewTask || !Number.isFinite(selectedTopicIndexParam) ? undefined : selectedTopicIndexParam,
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
      const correctedResponse = await proofreadAimResponse(response, agent.defaultInstruction)
      applyGenerationResponse(assistantMessageId, currentInput, response, correctedResponse)
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

  async function handleGenerate() {
    if (hasEditorSelection || imageAttachments.length > 0) {
      await handleSend()
      return
    }
    const currentInput = input.trim()
    const startsNewTask = shouldIsolateWritingInstruction(currentInput, messages.length > 0)
    const workbenchCommand = detectAimWorkbenchCommand(currentInput)
    if (!startsNewTask && workbenchCommand && runWorkbenchCommand(workbenchCommand)) return
    await generateWithInput(currentInput, { startsNewTask })
  }

  function retryFailedMessage(message: ChatMessage) {
    if (!message.failure || busy) return
    if (message.failure.kind === "generate") {
      void generateWithInput(message.failure.retryText, { retryMessageId: message.id })
      return
    }
    void sendText(message.failure.retryText, { retryMessageId: message.id })
  }

  function handleStop() {
    requestAbortRef.current?.abort()
  }

  const handleRepurpose = useCallback(
    (msgId: string) => async (fmt: ContentFormat) => {
        setIsGenerating(true)
        try {
          if (projectEnabled && !selectedProjectId) {
          toast.error("你的 IP 营销全案还在配置中")
          return
        }
        const base = messages.find((m) => m.id === msgId)?.deliverables
        const mainContent = base?.results.find((r) => r.format === "video_script")?.content
        if (!mainContent) return
        const response = await generateAimContent({
          rawInput: `基于以下脚本，派生${FORMAT_LABELS[fmt]}：\n\n${mainContent}`,
          targetFormats: [fmt],
          projectId: projectEnabled ? selectedProjectId || undefined : undefined,
          taskType: "repurpose",
        })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.deliverables
              ? { ...m, deliverables: { ...m.deliverables, results: [...m.deliverables.results, ...response.results] } }
              : m,
          ),
        )
        refreshHistory({ force: true, agentId: selectedAgentId })
        toast.success(`${FORMAT_LABELS[fmt]}已生成`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "生成失败")
      } finally {
        setIsGenerating(false)
      }
    },
    [messages, projectEnabled, refreshHistory, selectedAgentId, selectedProjectId],
  )

  const handleQuality = useCallback(
    (msgId: string) => async () => {
      const base = messages.find((m) => m.id === msgId)?.deliverables
      const mainContent =
        base?.results.find((r) => r.format === "video_script")?.content
        || base?.results.find((r) => r.format === "koubo_script")?.content
      if (!mainContent) return
      setIsQualityChecking(true)
      try {
        const report = await checkScriptQuality({
          content: mainContent,
          persona: agent.defaultInstruction,
          publishPlatform: "douyin",
        })
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, qualityReport: report } : m)),
        )
        toast.success("发布前自查完成")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "质检失败")
      } finally {
        setIsQualityChecking(false)
      }
    },
    [messages, agent],
  )

  function closeWorkflowBriefDialog() {
    setWorkflowBriefDialogOpen(false)
    setWorkflowBrief(null)
  }

  function confirmWorkflowBrief() {
    if (!workflowBrief) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("agent", "content_producer")
    params.set("stage", "content")
    lastAgentParamRef.current = "content_producer"
    setSelectedAgentId("content_producer")
    setWorkflowBrief({ ...workflowBrief, confirmed: workflowBriefForm })
    setWorkflowBriefDialogOpen(false)
    setInput(workflowBrief.nextInput)
    router.replace(`/aim?${params.toString()}`)
    toast.success("任务单已确认，开始内容创作")
  }

  const busy = isThinking || isGenerating || isQualityChecking || isTranscribing
  const hasEditor = Boolean(sourceOriginalText.trim() || editorText.trim())

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-3.5rem)] min-h-115 overflow-hidden md:-mx-6 md:-my-6">
      {/* 对话区（智能体列表与最近内容已移至全局侧边栏） */}
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-card px-4 md:px-6">
        <AimWorkbenchHeader
          workflowStage={currentWorkflowStage}
          agentTitle={agent.title}
          AgentIcon={agent.icon}
          projectEnabled={projectEnabled}
          projectName={projects.find((project) => project.id === selectedProjectId)?.name}
          canEvolve={!isThinking && !isGenerating && !isEvolving && messages.length >= 2}
          isEvolving={isEvolving}
          onStageChange={beginWorkflowStage}
          onToggleProject={() => setProjectEnabled((current) => !current)}
          onEvolve={() => void handleEvolveConversation()}
          onReset={() => resetConversation()}
        />

        <AimProjectNotices
          projectsCount={projects.length}
          selectedProjectId={selectedProjectId}
          personaProgress={personaProgress}
        />

        {selectedProjectId && (
          <AimProjectTaskPanel
            records={projectWorkflowRecords}
            loading={isLoadingProjectWorkflow}
            onOpenTask={(id) => void openProjectWorkflowTask(id)}
            onStartStage={beginWorkflowStage}
          />
        )}

        <AimEvolutionSuggestions
          suggestions={evolutionSuggestions}
          onDismiss={(suggestion) => setEvolutionSuggestions((current) => current.filter((item) => item !== suggestion))}
          onSave={(suggestion) => void handleSaveEvolutionSuggestion(suggestion)}
        />

        <AimMessageStream
          ref={scrollRef}
          messages={messages}
          busy={busy}
          workflowLanding={showWorkflowLanding}
          agentIntro={agent.intro}
          workflowStage={currentWorkflowStage}
          selectedAgentId={selectedAgentId}
          selectedProjectId={selectedProjectId}
          latestDeliverableMessageId={findLatestAimVideoDeliverableMessageId(messages)}
          onBeginStage={beginWorkflowStage}
          onBeginContentAction={beginContentAction}
          actions={{
            onSubmitChoice: (text) => void sendText(text),
            onRetry: retryFailedMessage,
            onApplyReplacement: applyEditorReplacement,
            onRepurpose: handleRepurpose,
            onQuality: handleQuality,
            onMarkStatus: handleMarkStatus,
            onNextAction: handleAimNextAction,
            onEditResult: (messageId, format, content) => openEditorFromResult(messageId, format, content),
            onOpenRecord: openRecordDialog,
            onCompileToWiki: (context) => setWikiDialog({ open: true, context }),
          }}
        />

        {/* 输入区 */}
        <footer className="border-t px-3 py-2 sm:px-5">
          {RESEARCH_HINT_AGENT_IDS.has(selectedAgentId) && (
            <p className="mx-auto mb-2 hidden max-w-2xl text-xs text-muted-foreground lg:block">
              可以直接把官网链接、竞品资料、客户资料或 Research Agent 资料包粘贴到聊天框里，系统会作为诊断上下文使用。
            </p>
          )}
          <AimPromptComposer
            value={input}
            placeholder={agent.placeholder}
            busy={busy}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            isGenerating={isGenerating || isUploadingImage}
            canGenerate={
              (input.trim().length > 0 || imageAttachments.length > 0) &&
              (!projectEnabled || Boolean(selectedProjectId)) &&
              !isUploadingImage
            }
            primaryActionLabel={hasEditorSelection ? editorPanelLabels.selectActionLabel : agent.primaryActionLabel}
            onChange={setInput}
            onGenerate={handleGenerate}
            onStop={handleStop}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            skills={agent.skills}
            onUseSkill={handleUseSkill}
            imageAttachments={imageAttachments}
            onAddImages={(files) => void handleAddImages(files)}
            onRemoveImage={(id) => setImageAttachments((current) => current.filter((image) => image.id !== id))}
          />
        </footer>
      </section>

      {hasEditor && (
        <BenchmarkEditorPanel
          open={editorPanelOpen}
          width={editorPanelWidth}
          labels={editorPanelLabels}
          referenceText={annotatedReferenceText}
          editorText={editorText}
          editorFormat={editorFormat}
          onOpen={() => setEditorPanelOpen(true)}
          onClose={() => setEditorPanelOpen(false)}
          onWidthChange={setEditorPanelWidth}
          onEditorTextChange={setEditorText}
          onReferenceSelection={setReferenceSelection}
          onDraftSelection={setDraftSelection}
          onSave={saveEditorToDeliverable}
          onImitate={handleImitate}
          imitating={isImitating}
          imitateStyleId={imitateStyleId}
          onImitateStyleChange={setImitateStyleId}
        />
      )}

      {wikiDialog.open && wikiDialog.context && (
        <IpWikiDialog
          key={wikiDialog.context.sourceGenerationId ?? "ip-wiki"}
          context={wikiDialog.context}
          onClose={() => setWikiDialog((prev) => ({ ...prev, open: false }))}
        />
      )}

      <WorkflowBriefDialog
        open={workflowBriefDialogOpen && !!workflowBrief}
        form={workflowBriefForm}
        busy={isBuildingWorkflowBrief}
        onChange={setWorkflowBriefForm}
        onCancel={closeWorkflowBriefDialog}
        onConfirm={confirmWorkflowBrief}
      />

      <WorkflowRecordDialog
        dialog={recordDialog}
        busy={busy}
        decisionForm={decisionForm}
        publishForm={publishForm}
        retroForm={retroForm}
        ruleForm={retroRuleForm}
        outcomeForm={outcomeForm}
        outcomeWindow={outcomeWindow}
        onDecisionChange={setDecisionForm}
        onPublishChange={setPublishForm}
        onRetroChange={setRetroForm}
        onRuleChange={setRetroRuleForm}
        onOutcomeChange={setOutcomeForm}
        onOutcomeWindowChange={setOutcomeWindow}
        onClose={closeRecordDialog}
        onSubmit={() => void submitRecordDialog()}
      />
    </div>
  )
}

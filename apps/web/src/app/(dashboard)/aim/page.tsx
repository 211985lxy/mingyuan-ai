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
import { transcribeAudio, type ContentFormat } from "@/lib/api/client"
import {
  getWorkflowStageForAgent,
  isAimWorkflowStage,
  type AimContentAction,
  type ConfirmedWorkflowBrief,
} from "@/lib/aim-workflow"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { useAimChatActions } from "@/hooks/use-aim-chat-actions"
import { useAimProjectWorkspace } from "@/hooks/use-aim-project-workspace"
import { useAimWorkflowRecords } from "@/hooks/use-aim-workflow-records"
import { useAimEditorActions } from "@/hooks/use-aim-editor-actions"
import { useAimEvolutionActions } from "@/hooks/use-aim-evolution-actions"
import { useAimGenerationActions, type AimWorkflowBriefState } from "@/hooks/use-aim-generation-actions"
import { useAimImageAttachments } from "@/hooks/use-aim-image-attachments"
import { useAimWorkflowActions } from "@/hooks/use-aim-workflow-actions"
import { useAimDraftAutosave, useAimMessageAutoScroll, useAimSourceHydration } from "@/hooks/use-aim-workbench-effects"
import { useAimAgentDraftSwitch, useAimHistoryLoad, useAimTopicPrefill, useAimVideoCopyPrefill } from "@/hooks/use-aim-route-sync"
import {
  AIM_AGENT_OPTIONS,
  DEFAULT_AIM_AGENT,
  isValidAimAgent,
  type AimAgentId,
  type AimAgentMeta,
} from "@/lib/aim-ui-config"
import {
  getAimAgentGuide,
  type AimAgentGuide,
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
} from "@/lib/aim-editor"
import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"
import { clearAimDraft, loadAimDraft, type AimDraft } from "@/lib/aim/draft-storage"
import {
  buildAimEditorContext,
  buildAimBenchmarkQualityMessage,
  buildAimBenchmarkRewriteInput,
  extractBenchmarkAnalysisText,
  extractPersonaProgress as extractProgress,
  findLatestAimVideoDeliverableMessageId,
  nextAimWorkbenchId as nextId,
} from "@/lib/aim/workbench-helpers"
import {
  type IpWikiDialogContext,
  type AimWorkbenchMessage as ChatMessage,
} from "@/lib/aim/workbench-types"

interface AimAgentOption extends AimAgentMeta, AimAgentGuide {}

const AGENT_OPTIONS: AimAgentOption[] = AIM_AGENT_OPTIONS.map((meta) => ({
  ...meta,
  ...getAimAgentGuide(meta.id),
}))

const RESEARCH_HINT_AGENT_IDS = new Set<AimAgentId>(["business_system_diagnosis", "business_diagnosis"])

function buildSkillPrompt(skill: AimWorkbenchSkill, context: {
  editorText: string
  sourceOriginalText: string
  sourceAnalysisText: string
  sourceTopicTitle: string
  messages: ChatMessage[]
}) {
  const hasCurrentContext = Boolean(
    context.editorText.trim() || context.sourceOriginalText.trim() || context.sourceAnalysisText.trim()
    || context.sourceTopicTitle.trim()
    || context.messages.some((message) => message.role === "assistant" && (message.content.trim() || message.deliverables)),
  )
  return hasCurrentContext && !skill.prompt.includes("当前")
    ? `请基于当前内容，${skill.prompt.replace(/^请/, "")}`
    : skill.prompt
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
  const { imageAttachments, isUploadingImage, addImages, removeImage, clearImages } = useAimImageAttachments()
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
  const [workflowBrief, setWorkflowBrief] = useState<AimWorkflowBriefState | null>(null)
  const [workflowBriefForm, setWorkflowBriefForm] = useState<ConfirmedWorkflowBrief>({})
  const [workflowBriefDialogOpen, setWorkflowBriefDialogOpen] = useState(false)
  const [isBuildingWorkflowBrief, setIsBuildingWorkflowBrief] = useState(false)
  const [contentAction, setContentAction] = useState<AimContentAction | null>(null)

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
  }), [
    setEditorFormat,
    setEditorPanelOpen,
    setEditorPanelWidth,
    setEditorSourceMessageId,
    setEditorText,
    setInput,
    setMessages,
    setSelectedAgentId,
    setSelectedProjectId,
    setSourceAnalysisText,
    setSourceOriginalText,
    setSourceTopicRationale,
    setSourceTopicTitle,
    setSourceVideoCopyExtractionId,
  ])

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
  }, [setDraftSelection, setEditorFormat, setEditorPanelOpen, setEditorSourceMessageId, setEditorText])

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

  const {
    generateWithInput,
    stopGeneration: handleStop,
    repurposeDeliverable: handleRepurpose,
    checkDeliverableQuality: handleQuality,
  } = useAimGenerationActions({
    messages,
    setMessages,
    setInput,
    setSourceOriginalText,
    setSourceAnalysisText,
    setWorkflowBrief,
    setContentAction,
    setIsGenerating,
    setIsQualityChecking,
    agent,
    selectedAgentId,
    selectedProjectId,
    projectEnabled,
    currentWorkflowStage,
    contentAction,
    workflowBrief,
    sourceVideoCopyExtractionId,
    sourceTopicTitle,
    sourceTopicRationale,
    topicSelectionId: topicSelectionIdParam,
    selectedTopicIndex: selectedTopicIndexParam,
    requestAbortRef,
    pendingScrollMessageIdRef,
    clearCurrentTaskContext,
    openEditorFromResult,
    refreshHistory,
    refreshProjectWorkflow,
  })

  const {
    beginWorkflowStage,
    beginContentAction,
    handleAimNextAction,
    closeWorkflowBriefDialog,
    confirmWorkflowBrief,
  } = useAimWorkflowActions({
    searchParams,
    router,
    lastAgentParamRef,
    selectedAgentId,
    selectedProjectId,
    agentTitle: agent.title,
    workflowBrief,
    workflowBriefForm,
    setSelectedAgentId,
    setMessages,
    setInput,
    setContentAction,
    setWorkflowBrief,
    setWorkflowBriefForm,
    setWorkflowBriefDialogOpen,
    setIsBuildingWorkflowBrief,
    clearCurrentTaskContext,
  })

  const {
    isEvolving,
    evolutionSuggestions,
    dismissEvolutionSuggestion,
    rememberWorkbenchPreference,
    handleEvolveConversation,
    handleSaveEvolutionSuggestion,
  } = useAimEvolutionActions({ messages, selectedProjectId, projectEnabled })

  function resetConversation() {
    requestAbortRef.current?.abort()
    setMessages([])
    setInput("")
    clearCurrentTaskContext()
    clearAimDraft(selectedAgentId)
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

  const { sendText } = useAimChatActions({
    messages,
    setMessages,
    setInput,
    setIsThinking,
    selectedAgentId,
    selectedProjectId,
    projectEnabled,
    requestAbortRef,
    clearCurrentTaskContext,
    clearImages,
    runWorkbenchCommand,
  })

  async function openProjectWorkflowTask(id: string) {
    if (!selectedProjectId) return
    await refreshHistory({ force: true, projectId: selectedProjectId })
    requestLoad(id)
  }

  const handleUseSkill = useCallback((skill: AimWorkbenchSkill) => {
    const prompt = buildSkillPrompt(skill, { editorText, sourceOriginalText, sourceAnalysisText, sourceTopicTitle, messages })
    setInput((current) => {
      const text = current.trim()
      return text ? `${prompt}\n\n---\n${text}\n---` : prompt
    })
    toast.success("技能指令已填入")
  }, [editorText, messages, setInput, sourceAnalysisText, sourceOriginalText, sourceTopicTitle])

  async function handleSend() {
    await sendText(input.trim(), hasEditorSelection ? {
      editorContext: buildAimEditorContext({ action: "用户追问", referenceSelection: referenceSelection.text, draftSelection: draftSelection.text, editorText, labels: editorPanelLabels }),
      editorApplyRange: draftSelection.text.trim() ? draftSelection.range : undefined,
      images: imageAttachments,
    } : { images: imageAttachments })
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
          onDismiss={dismissEvolutionSuggestion}
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
            onAddImages={(files) => void addImages(files)}
            onRemoveImage={removeImage}
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

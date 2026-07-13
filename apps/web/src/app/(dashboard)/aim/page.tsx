"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Database,
  FileText,
  Loader2,
  Target,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IpWikiDialog, type IpWikiDialogContext } from "./ip-wiki-dialog"
import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { BenchmarkEditorPanel, type EditorSelection } from "@/features/aim/components/benchmark-editor-panel"
import { AimRecordDialog } from "@/features/aim/components/record-dialog"
import { WorkflowBriefDialog } from "@/features/aim/components/workflow-brief-dialog"
import { AimMessageList } from "@/features/aim/components/message-list"
import { AimWorkbenchChrome } from "@/features/aim/components/workbench-chrome"
import { aimDraftStorageKey, loadAimDraft } from "@/features/aim/aim-draft-storage"
import type {
  AimChatToolAction,
  AimDraft,
  ChatMessage,
  RecordDialogMode,
} from "@/features/aim/aim-workbench-types"
import {
  type AimGeneration,
  type ContentFormat,
} from "@/lib/api/client"
import { getWorkflowStageForAgent, isAimWorkflowStage } from "@/lib/aim-workflow"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { transcribeAudio } from "@/lib/api/client"
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
import { detectAimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import {
  EDITOR_PANEL_DEFAULT_WIDTH,
  applyFirstMatchingStructureToReference,
} from "@/lib/aim-editor"
import { getAimEditorPanelLabels, type EditorPanelLabels } from "@/lib/aim-editor-labels"
import { extractBenchmarkAnalysisText, extractBenchmarkOriginalText, extractProgress } from "@/features/aim/aim-text-utils"
import { useAimProjectWorkflow } from "@/features/aim/hooks/use-aim-project-workflow"
import { useAimRecordDialog } from "@/features/aim/hooks/use-aim-record-dialog"
import { useAimEvolution } from "@/features/aim/hooks/use-aim-evolution"
import { useAimImageAttachments } from "@/features/aim/hooks/use-aim-image-attachments"
import { useAimWorkflowActions } from "@/features/aim/hooks/use-aim-workflow-actions"
import { useAimRouteEffects } from "@/features/aim/hooks/use-aim-route-effects"
import { useAimChatActions } from "@/features/aim/hooks/use-aim-chat-actions"
import { useAimPublishActions } from "@/features/aim/hooks/use-aim-publish-actions"
import { useAimGenerateActions } from "@/features/aim/hooks/use-aim-generate-actions"
import { useAimEditorActions } from "@/features/aim/hooks/use-aim-editor-actions"
import { getLatestDeliverableMessageId } from "@/features/aim/aim-command-utils"

interface AimAgentOption extends AimAgentMeta, AimAgentGuide {}

const AGENT_OPTIONS: AimAgentOption[] = AIM_AGENT_OPTIONS.map((meta) => ({
  ...meta,
  ...getAimAgentGuide(meta.id),
}))

const RESEARCH_HINT_AGENT_IDS = new Set<AimAgentId>(["business_system_diagnosis", "business_diagnosis"])

/** 生成一个稳定的临时 id（组件内使用，避免 Math.random 之外的库依赖） */
let _seq = 0
function nextId(prefix = "m") {
  _seq += 1
  return `${prefix}-${Date.now()}-${_seq}`
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
  const {
    imageAttachments,
    setImageAttachments,
    isUploadingImage,
    handleAddImages,
  } = useAimImageAttachments()
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
  const [referenceSelection, setReferenceSelection] = useState<EditorSelection>({ text: "", range: { start: 0, end: 0 } })
  const [draftSelection, setDraftSelection] = useState<EditorSelection>({ text: "", range: { start: 0, end: 0 } })
  const [isThinking, setIsThinking] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isQualityChecking, setIsQualityChecking] = useState(false)
  const {
    projects,
    projectWorkflowRecords,
    isLoadingProjectWorkflow,
    selectedProjectId,
    setSelectedProjectId,
    projectEnabled,
    setProjectEnabled,
    refreshProjectWorkflow,
  } = useAimProjectWorkflow(initialDraft?.selectedProjectId || "")
  const [wikiDialog, setWikiDialog] = useState<{ open: boolean; context: IpWikiDialogContext | null }>({
    open: false,
    context: null,
  })

  // 历史记录由侧边栏共享 store 管理（侧边栏渲染列表、生成成功后刷新、点击后触发加载）
  const storeHistory = useAimWorkspaceStore((s) => s.history)
  const loadTargetId = useAimWorkspaceStore((s) => s.loadTargetId)
  const refreshHistory = useAimWorkspaceStore((s) => s.fetchHistory)
  const clearLoadTarget = useAimWorkspaceStore((s) => s.clearLoadTarget)
  const requestLoad = useAimWorkspaceStore((s) => s.requestLoad)

  const {
    isEvolving,
    evolutionSuggestions,
    setEvolutionSuggestions,
    rememberWorkbenchPreference,
    handleEvolveConversation,
    handleSaveEvolutionSuggestion,
  } = useAimEvolution({
    messages,
    projectEnabled,
    selectedProjectId,
  })

  const {
    recordDialog,
    setRecordDialog,
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
    openRecordDialog,
    handleSubmitRecordDialog,
  } = useAimRecordDialog({
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

  const lastAgentParamRef = useRef(agentParam)

  const {
    workflowBrief,
    setWorkflowBrief,
    workflowBriefForm,
    setWorkflowBriefForm,
    workflowBriefDialogOpen,
    setWorkflowBriefDialogOpen,
    isBuildingWorkflowBrief,
    contentAction,
    setContentAction,
    beginWorkflowStage,
    beginContentAction,
    handleAimNextAction,
    confirmWorkflowBrief,
  } = useAimWorkflowActions({
    searchParams,
    selectedAgentId,
    selectedProjectId,
    agentTitle: agent.title,
    lastAgentParamRef,
    replaceAimUrl: router.replace,
    setSelectedAgentId,
    setInput,
    setMessages,
    setSourceVideoCopyExtractionId,
    setSourceOriginalText,
    setSourceAnalysisText,
    setSourceTopicTitle,
    setSourceTopicRationale,
    setEditorText,
    setEditorFormat,
    setEditorSourceMessageId,
  })

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

  const openEditorFromResult = useCallback((messageId: string, format: ContentFormat, content: string) => {
    setEditorText(content)
    setEditorFormat(format)
    setEditorSourceMessageId(messageId)
    setEditorPanelOpen(true)
    setDraftSelection({ text: "", range: { start: 0, end: 0 } })
  }, [])

  useAimRouteEffects({
    activeAgentId,
    agentParam,
    searchParams,
    topicTitleParam,
    topicRationaleParam,
    projectIdParam,
    ideaParam,
    videoCopyExtractionIdParam,
    loadTargetId,
    storeHistory,
    selectedAgentId,
    selectedProjectId,
    input,
    messages,
    sourceVideoCopyExtractionId,
    sourceOriginalText,
    sourceAnalysisText,
    sourceTopicTitle,
    sourceTopicRationale,
    editorText,
    editorFormat,
    editorSourceMessageId,
    editorPanelWidth,
    editorPanelOpen,
    lastAgentParamRef,
    replaceAimUrl: router.replace,
    clearLoadTarget,
    openEditorFromResult,
    setSelectedAgentId,
    setSelectedProjectId,
    setInput,
    setMessages,
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
  })

  // 自动滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const targetId = pendingScrollMessageIdRef.current
    if (targetId) {
      pendingScrollMessageIdRef.current = null
      requestAnimationFrame(() => {
        el.querySelector<HTMLElement>(`[data-message-id="${targetId}"]`)?.scrollIntoView({
          block: "start",
        })
      })
      return
    }
    el.scrollTop = el.scrollHeight
  }, [messages, isThinking, isGenerating])

  /** 人设故事梳理：取最近一条助手回复的【进度 XX%】驱动顶部进度条 */
  const personaProgress = useMemo(() => {
    if (agent.id !== "persona") return null
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
    return lastAssistant ? extractProgress(lastAssistant.content) : null
  }, [messages, agent.id])

  function resetConversation() {
    setMessages([])
    setInput("")
    setSourceVideoCopyExtractionId(undefined)
    setSourceOriginalText("")
    setSourceAnalysisText("")
    setSourceTopicTitle("")
    setSourceTopicRationale("")
    setEditorText("")
    setEditorFormat(undefined)
    setEditorSourceMessageId(undefined)
    if (typeof window !== "undefined") window.sessionStorage.removeItem(aimDraftStorageKey(selectedAgentId))
  }

  const { generateWithInput } = useAimGenerateActions({
    agent,
    selectedAgentId,
    selectedProjectId,
    projectEnabled,
    messages,
    sourceVideoCopyExtractionId,
    sourceTopicTitle,
    sourceTopicRationale,
    topicSelectionId: topicSelectionIdParam || undefined,
    selectedTopicIndex: selectedTopicIndexParam,
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
  })

  const {
    handleRepurpose,
    handleQuality,
    handleMarkStatus,
  } = useAimPublishActions({
    messages,
    selectedAgentId,
    selectedProjectId,
    projectEnabled,
    agentInstruction: agent.defaultInstruction,
    refreshHistory,
    refreshProjectWorkflow,
    setMessages,
    setIsGenerating,
    setIsQualityChecking,
  })

  const {
    isImitating,
    imitateStyleId,
    setImitateStyleId,
    handleImitate,
    saveEditorToDeliverable,
    runWorkbenchCommand,
    buildEditorContext,
    applyEditorReplacement,
  } = useAimEditorActions({
    selectedAgentId,
    selectedProjectId,
    projectEnabled,
    messages,
    sourceOriginalText,
    sourceAnalysisText,
    sourceTopicTitle,
    editorText,
    editorFormat,
    editorSourceMessageId,
    referenceSelection,
    draftSelection,
    editorPanelLabels,
    agent,
    requestAbortRef,
    generateWithInput,
    handleQuality,
    resetConversation,
    rememberWorkbenchPreference,
    setInput,
    setMessages,
    setEditorText,
    setEditorPanelOpen,
    setSourceOriginalText,
    setIsGenerating,
    setIsThinking,
  })

  const { sendText } = useAimChatActions({
    selectedAgentId,
    selectedProjectId,
    projectEnabled,
    messages,
    requestAbortRef,
    runWorkbenchCommand,
    detectWorkbenchCommand: detectAimWorkbenchCommand,
    setMessages,
    setInput,
    setImageAttachments,
    setIsThinking,
  })

  async function openProjectWorkflowTask(id: string) {
    if (!selectedProjectId) return
    await refreshHistory({ force: true, projectId: selectedProjectId })
    requestLoad(id)
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
      editorContext: buildEditorContext("用户追问"),
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
    const workbenchCommand = detectAimWorkbenchCommand(currentInput)
    if (workbenchCommand && runWorkbenchCommand(workbenchCommand)) return
    await generateWithInput(currentInput)
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

  const busy = isThinking || isGenerating || isQualityChecking || isTranscribing
  const hasEditor = Boolean(sourceOriginalText.trim() || editorText.trim())

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-3.5rem)] min-h-115 overflow-hidden md:-mx-6 md:-my-6">
      {/* 对话区（智能体列表与最近内容已移至全局侧边栏） */}
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-card px-4 md:px-6">
        <AimWorkbenchChrome
          agentTitle={agent.title}
          agentIcon={agent.icon}
          currentWorkflowStage={currentWorkflowStage}
          projects={projects}
          projectEnabled={projectEnabled}
          selectedProjectId={selectedProjectId}
          projectWorkflowRecords={projectWorkflowRecords}
          isLoadingProjectWorkflow={isLoadingProjectWorkflow}
          personaProgress={personaProgress}
          evolutionSuggestions={evolutionSuggestions}
          isThinking={isThinking}
          isGenerating={isGenerating}
          isEvolving={isEvolving}
          messagesLength={messages.length}
          onStartStage={beginWorkflowStage}
          onToggleProjectEnabled={() => setProjectEnabled((value) => !value)}
          onEvolveConversation={() => void handleEvolveConversation()}
          onResetConversation={resetConversation}
          onOpenProjectTask={(id) => void openProjectWorkflowTask(id)}
          onDismissEvolutionSuggestion={(suggestion) => setEvolutionSuggestions((prev) => prev.filter((item) => item !== suggestion))}
          onSaveEvolutionSuggestion={(suggestion) => void handleSaveEvolutionSuggestion(suggestion)}
        />

        {/* 消息流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-4 sm:px-3">
          <AimMessageList
            messages={messages}
            showWorkflowLanding={showWorkflowLanding}
            agentIntro={agent.intro}
            currentWorkflowStage={currentWorkflowStage}
            selectedAgentId={selectedAgentId}
            selectedProjectId={selectedProjectId}
            busy={busy}
            latestDeliverableMessageId={getLatestDeliverableMessageId(messages)}
            onStartStage={beginWorkflowStage}
            onBeginContentAction={beginContentAction}
            onSendText={(text) => void sendText(text)}
            onRetryFailedMessage={retryFailedMessage}
            onApplyEditorReplacement={applyEditorReplacement}
            onRepurpose={handleRepurpose}
            onQuality={handleQuality}
            onMarkStatus={handleMarkStatus}
            onNextAction={handleAimNextAction}
            onEditResult={openEditorFromResult}
            onOpenRecordDialog={openRecordDialog}
            onCompileToWiki={(sourceGenerationId, positioningText) => {
              setWikiDialog({
                open: true,
                context: {
                  projectId: selectedProjectId,
                  sourceGenerationId,
                  positioningText,
                },
              })
            }}
          />
        </div>

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
        busy={isBuildingWorkflowBrief}
        form={workflowBriefForm}
        setForm={setWorkflowBriefForm}
        onOpenChange={(open) => {
          setWorkflowBriefDialogOpen(open)
          if (!open) setWorkflowBrief(null)
        }}
        onCancel={() => { setWorkflowBriefDialogOpen(false); setWorkflowBrief(null) }}
        onConfirm={confirmWorkflowBrief}
      />

      <AimRecordDialog
        recordDialog={recordDialog}
        decisionForm={decisionForm}
        publishForm={publishForm}
        retroForm={retroForm}
        retroRuleForm={retroRuleForm}
        outcomeForm={outcomeForm}
        outcomeWindow={outcomeWindow}
        busy={busy}
        setRecordDialog={setRecordDialog}
        setDecisionForm={setDecisionForm}
        setPublishForm={setPublishForm}
        setRetroForm={setRetroForm}
        setRetroRuleForm={setRetroRuleForm}
        setOutcomeForm={setOutcomeForm}
        setOutcomeWindow={setOutcomeWindow}
        onSubmit={() => void handleSubmitRecordDialog()}
      />
    </div>
  )
}

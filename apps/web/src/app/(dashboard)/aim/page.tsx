"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import type { IpWikiDialogContext } from "./ip-wiki-dialog"
import type { EditorSelection } from "@/features/aim/components/benchmark-editor-panel"
import { AimWorkbenchLayout } from "@/features/aim/components/workbench-layout"
import { aimDraftStorageKey, loadAimDraft } from "@/features/aim/aim-draft-storage"
import type { AimDraft, ChatMessage } from "@/features/aim/aim-workbench-types"
import type { ContentFormat } from "@/lib/api/client"
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
import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"
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

export default function AimPage() {
  const router = useRouter()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const agentParam = searchParams.get("agent")
  const workflowStageParam = searchParams.get("stage")
  const topicTitleParam = searchParams.get("topicTitle")
  const topicRationaleParam = searchParams.get("topicRationale")
  const topicSelectionIdParam = searchParams.get("topicSelectionId")
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
  const { imageAttachments, setImageAttachments, isUploadingImage, handleAddImages } = useAimImageAttachments()
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
  const { projects, projectWorkflowRecords, isLoadingProjectWorkflow, selectedProjectId, setSelectedProjectId, projectEnabled, setProjectEnabled, refreshProjectWorkflow } = useAimProjectWorkflow(initialDraft?.selectedProjectId || "")
  const [wikiDialog, setWikiDialog] = useState<{ open: boolean; context: IpWikiDialogContext | null }>({
    open: false,
    context: null,
  })

  const storeHistory = useAimWorkspaceStore((s) => s.history)
  const loadTargetId = useAimWorkspaceStore((s) => s.loadTargetId)
  const refreshHistory = useAimWorkspaceStore((s) => s.fetchHistory)
  const clearLoadTarget = useAimWorkspaceStore((s) => s.clearLoadTarget)
  const requestLoad = useAimWorkspaceStore((s) => s.requestLoad)

  const { isEvolving, evolutionSuggestions, setEvolutionSuggestions, rememberWorkbenchPreference, handleEvolveConversation, handleSaveEvolutionSuggestion } = useAimEvolution({
    messages,
    projectEnabled,
    selectedProjectId,
  })

  const { recordDialog, setRecordDialog, decisionForm, setDecisionForm, publishForm, setPublishForm, retroForm, setRetroForm, outcomeForm, setOutcomeForm, outcomeWindow, setOutcomeWindow, retroRuleForm, setRetroRuleForm, openRecordDialog, handleSubmitRecordDialog } = useAimRecordDialog({
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

  const projectState = { projects, projectEnabled, projectWorkflowRecords, isLoadingProjectWorkflow, setProjectEnabled }
  const recordState = { recordDialog, setRecordDialog, decisionForm, setDecisionForm, publishForm, setPublishForm, retroForm, setRetroForm, outcomeForm, setOutcomeForm, outcomeWindow, setOutcomeWindow, retroRuleForm, setRetroRuleForm, openRecordDialog, handleSubmitRecordDialog }

  return (
    <AimWorkbenchLayout
      {...{ agent, currentWorkflowStage, showWorkflowLanding, selectedAgentId, selectedProjectId, projectState, messages, busy, isThinking, isGenerating, isEvolving, isUploadingImage, isRecording, isTranscribing, personaProgress, evolutionSuggestions, input, imageAttachments, hasEditorSelection, hasEditor, editorPanelLabels, editorPanelOpen, editorPanelWidth, annotatedReferenceText, editorText, editorFormat, isImitating, imitateStyleId, wikiDialog, workflowBrief, workflowBriefForm, workflowBriefDialogOpen, isBuildingWorkflowBrief, recordState }}
      latestDeliverableMessageId={getLatestDeliverableMessageId(messages)}
      researchHintAgentIds={RESEARCH_HINT_AGENT_IDS}
      scrollRef={scrollRef}
      {...{ setInput, setImageAttachments, setEditorPanelOpen, setEditorPanelWidth, setEditorText, setReferenceSelection, setDraftSelection, setImitateStyleId, setWikiDialog, setWorkflowBrief, setWorkflowBriefForm, setWorkflowBriefDialogOpen, setEvolutionSuggestions }}
      {...{ onStartStage: beginWorkflowStage, onBeginContentAction: beginContentAction }}
      onEvolveConversation={() => void handleEvolveConversation()}
      {...{ onResetConversation: resetConversation }}
      onOpenProjectTask={(id) => void openProjectWorkflowTask(id)}
      onSaveEvolutionSuggestion={(suggestion) => void handleSaveEvolutionSuggestion(suggestion)}
      onSendText={(text) => void sendText(text)}
      {...{ onRetryFailedMessage: retryFailedMessage, onApplyEditorReplacement: applyEditorReplacement }}
      {...{ onRepurpose: handleRepurpose, onQuality: handleQuality, onMarkStatus: handleMarkStatus }}
      onNextAction={(action, content, generationId) => void handleAimNextAction(action, content, generationId)}
      {...{ onEditResult: openEditorFromResult, onOpenRecordDialog: openRecordDialog }}
      onGenerate={() => void handleGenerate()}
      {...{ onStop: handleStop, onStartRecording: startRecording }}
      {...{ onUseSkill: handleUseSkill, onStopRecording: () => void stopRecording(), onAddImages: (files: FileList) => void handleAddImages(files) }}
      {...{ onSaveEditor: saveEditorToDeliverable, onImitate: handleImitate, onConfirmWorkflowBrief: confirmWorkflowBrief }}
      onSubmitRecordDialog={() => void handleSubmitRecordDialog()}
    />
  )
}

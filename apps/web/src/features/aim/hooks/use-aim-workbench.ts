"use client"

import { useState, useMemo, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"

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
import { useAimWorkspaceStore } from "@/lib/aim-workspace-store"
import { EDITOR_PANEL_DEFAULT_WIDTH } from "@/lib/aim-editor"
import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"
import { aimDraftProjectScope, clearAimDraft, loadAimDraft, type AimDraft } from "@/lib/aim/draft-storage"
import {
  extractPersonaProgress as extractProgress,
  findLatestAimVideoDeliverableMessageId,
} from "@/lib/aim/workbench-helpers"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { AimEditorSelection } from "@/components/aim/benchmark-editor-panel"
import type { IpWikiDialogContext, AimWorkbenchMessage as ChatMessage } from "@/lib/aim/workbench-types"
import { parseAimSearchParams } from "@/features/aim/aim-search-params"
import { useAimAgentConfig, useRouteSetters } from "@/features/aim/aim-agent-derivation"
import { useAimPageCommands } from "@/features/aim/hooks/use-aim-page-commands"
import { useAimSendActions } from "@/features/aim/hooks/use-aim-send-actions"
import { useAimInlineEditorBridge } from "@/features/aim/hooks/use-aim-inline-editor-bridge"
import { useAimProjectAttach } from "@/hooks/use-aim-project-attach"
import { collectAnalysisTextCandidates, buildAnnotatedReferenceText } from "@/features/aim/aim-reference-annotation"
import { useAimCopyStudioMode } from "@/features/aim/hooks/use-aim-copy-studio-mode"
import { useAimProjectScopeSwitch } from "@/features/aim/hooks/use-aim-project-scope-switch"
import { useAimPlanOrchestration } from "@/features/aim/hooks/use-aim-plan-orchestration"
import { useAimTurnIntentGate } from "@/features/aim/hooks/use-aim-turn-intent-gate"

/**
 * Master hook — consolidates all AIM workbench state, refs, and hook
 * orchestration so the page component is a thin assembly layer (params →
 * hook → JSX).  Return type is inferred from concrete hook outputs; do NOT
 * add an explicit interface (it would diverge from actual hook signatures).
 */
/**
 * @description React Hook：aimworkbench
 * @returns 无返回值
 */
export function useAimWorkbench() {
  const router = useRouter()
  const routeSearchParams = useSearchParams()
  const searchParams = useMemo(() => routeSearchParams ?? new URLSearchParams(), [routeSearchParams])
  const params = parseAimSearchParams(searchParams)
  const { agentParam, activeAgentId, modeParam, topicTitleParam, topicRationaleParam,
    topicSelectionIdParam, selectedTopicIndexParam, projectIdParam, videoCopyExtractionIdParam,
    ideaParam, workflowStageParam, generationIdParam } = params

  // ---- Draft-based initialization ----
  const explicitInitialScope = modeParam === "quick" ? "quick" : projectIdParam || undefined
  const [initialDraft] = useState<AimDraft | null>(() => loadAimDraft(activeAgentId, explicitInitialScope))
  const initialQuickMode = modeParam === "quick" || (!projectIdParam && initialDraft?.selectedProjectId === "")
  const [selectedAgentId, setSelectedAgentId] = useState<AimAgentId>(() => agentParam ? activeAgentId : initialDraft?.selectedAgentId || activeAgentId)
  const { agentModule, setAgentModule } = useAimCopyStudioMode({ selectedAgentId, initialModule: initialDraft?.agentModule })
  // ADR-002：本次选中的命名方法论 profile id（MVP 最多 1 个；从 draft 恢复）
  const [selectedMethodologyProfileIds, setSelectedMethodologyProfileIds] = useState<string[]>(
    () => initialDraft?.selectedMethodologyProfileIds ?? [],
  )
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
  const [editorPanelOpen, setEditorPanelOpen] = useState(() => initialDraft?.editorPanelOpen ?? false)
  const [referenceSelection, setReferenceSelection] = useState<AimEditorSelection>({ text: "", range: { start: 0, end: 0 } })
  const [draftSelection, setDraftSelection] = useState<AimEditorSelection>({ text: "", range: { start: 0, end: 0 } })
  const [isThinking, setIsThinking] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isQualityChecking, setIsQualityChecking] = useState(false)

  // ---- Project workspace ----
  const handlePublished = useCallback((publishedGenerationId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set("stage", "results")
    nextParams.set("generationId", publishedGenerationId)
    router.replace(`/aim?${nextParams.toString()}`)
  }, [router, searchParams])

  const {
    projects, selectedProjectId, setSelectedProjectId,
    projectEnabled, setProjectEnabled, projectAccessError,
    projectWorkflowRecords, isLoadingProjectWorkflow, refreshProjectWorkflow, refreshProjects,
  } = useAimProjectWorkspace({
    initialProjectId: projectIdParam || initialDraft?.selectedProjectId || "",
    quickMode: initialQuickMode,
  })

  // ---- Dialog / workflow state ----
  const [wikiDialog, setWikiDialog] = useState<{ open: boolean; context: IpWikiDialogContext | null }>({ open: false, context: null })
  const [workflowBrief, setWorkflowBrief] = useState<AimWorkflowBriefState | null>(null)
  const [workflowBriefForm, setWorkflowBriefForm] = useState<ConfirmedWorkflowBrief>({})
  const [workflowBriefDialogOpen, setWorkflowBriefDialogOpen] = useState(false)
  const [isBuildingWorkflowBrief, setIsBuildingWorkflowBrief] = useState(false)
  const [contentAction, setContentAction] = useState<AimContentAction | null>(null)

  // ---- Store subscriptions ----
  const storeHistory = useAimWorkspaceStore((s) => s.history)
  const loadTargetId = useAimWorkspaceStore((s) => s.loadTargetId)
  const refreshHistory = useAimWorkspaceStore((s) => s.fetchHistory)
  const clearLoadTarget = useAimWorkspaceStore((s) => s.clearLoadTarget)
  const requestLoad = useAimWorkspaceStore((s) => s.requestLoad)

  const {
    recordDialog, closeRecordDialog,
    decisionForm, setDecisionForm,
    publishForm, setPublishForm,
    retroForm, setRetroForm,
    outcomeForm, setOutcomeForm,
    outcomeWindow, setOutcomeWindow,
    retroRuleForm, setRetroRuleForm,
    handleMarkStatus, openRecordDialog, submitRecordDialog,
  } = useAimWorkflowRecords({
    messages,
    setMessages,
    selectedAgentId,
    selectedProjectId,
    refreshHistory,
    refreshProjectWorkflow,
    onPublished: handlePublished,
  })

  // ---- Refs ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const requestAbortRef = useRef<AbortController | null>(null)
  const pendingScrollMessageIdRef = useRef<string | null>(null)

  // ---- Agent config ----
  const agent = useAimAgentConfig({ selectedAgentId, modeParam, sourceTopicTitle, sourceVideoCopyExtractionId })

  const editorPanelLabels = useMemo(() => getAimEditorPanelLabels(selectedAgentId, editorFormat), [editorFormat, selectedAgentId])
  const currentWorkflowStage = isAimWorkflowStage(workflowStageParam) ? workflowStageParam : getWorkflowStageForAgent(selectedAgentId)
  const showWorkflowLanding = !agentParam && !workflowStageParam && messages.length === 0 && !input.trim() && !ideaParam
  const hasEditorSelection = Boolean(referenceSelection.text.trim() || draftSelection.text.trim())

  // ---- Analysis + annotation ----
  const analysisTextCandidates = useMemo(() => collectAnalysisTextCandidates(input, messages, sourceAnalysisText), [input, messages, sourceAnalysisText])
  const annotatedReferenceText = useMemo(() => buildAnnotatedReferenceText(sourceOriginalText, analysisTextCandidates), [analysisTextCandidates, sourceOriginalText])

  // ---- Audio recorder ----
  const { isRecording, isTranscribing, startRecording, stopRecording } = useAudioRecorder({
    transcribeFn: transcribeAudio,
    onTranscribeSuccess: (text) => setInput((prev) => (prev ? `${prev}\n${text}` : text)),
  })

  // ---- Editor actions ----
  const {
    isImitating, isSavingEditor, imitateStyleId, setImitateStyleId, handleImitate,
    fillReferenceFromConversation: fillReferenceTextFromConversation,
    integrateAssistantDraft: integrateLatestAssistantDraftToEditor,
    saveEditorToDeliverable,
    applyRestoredContent,
    optimizeOpening: handleOptimizeOpening,
    reviseCurrentDraft: handleReviseCurrentDraft,
    applyEditorReplacement,
  } = useAimEditorActions({
    messages, setMessages, setInput,
    sourceOriginalText, setSourceOriginalText, sourceTopicTitle,
    editorText, setEditorText, editorFormat, editorSourceMessageId,
    setEditorPanelOpen, referenceSelection, draftSelection,
    labels: editorPanelLabels, agentDefaultInstruction: agent.defaultInstruction,
    selectedProjectId, projectEnabled, selectedAgentId,
    requestAbortRef, setIsGenerating, setIsThinking,
  })

  // ---- Route setters + route sync ----
  const lastAgentParamRef = useRef(agentParam)
  const routeSetters = useRouteSetters({
    setSelectedAgentId, setAgentModule, setSelectedProjectId, setProjectEnabled, setMessages, setInput,
    setSourceVideoCopyExtractionId, setSourceOriginalText, setSourceAnalysisText,
    setSourceTopicTitle, setSourceTopicRationale, setEditorText, setEditorFormat,
    setEditorSourceMessageId, setEditorPanelWidth, setEditorPanelOpen,
  })
  const currentProjectScope = aimDraftProjectScope(projectEnabled, selectedProjectId)

  // ---- Effects ----
  useAimDraftAutosave({
    selectedAgentId, selectedProjectId, agentModule, input, messages,
    videoCopyExtractionId: sourceVideoCopyExtractionId,
    sourceOriginalText, sourceAnalysisText, sourceTopicTitle, sourceTopicRationale,
    editorText, editorFormat, editorSourceMessageId, editorPanelWidth, editorPanelOpen,
    selectedMethodologyProfileIds,
  }, projectEnabled)
  useAimSourceHydration({
    extractionId: sourceVideoCopyExtractionId, sourceOriginalText, sourceAnalysisText,
    setSourceOriginalText, setSourceAnalysisText,
  })

  useAimAgentDraftSwitch({ agentParam, activeAgentId, selectedProjectId, projectScope: currentProjectScope, lastAgentParamRef, setters: routeSetters })
  useAimTopicPrefill({ topicTitle: topicTitleParam, topicRationale: topicRationaleParam, projectId: projectIdParam, idea: ideaParam, router, searchParams, setters: routeSetters })
  useAimVideoCopyPrefill({ extractionId: videoCopyExtractionIdParam, router, searchParams, setters: routeSetters })

  // ---- openEditorFromResult (needed by generation + history load) ----
  // 默认同步编辑上下文，不自动打开右侧面板（内联编辑优先）
  // sync / inline handlers are created after sendText below
  const openEditorFromResultRef = useRef<(messageId: string, format: ContentFormat, content: string) => void>(() => {})
  const syncEditorFromResultProxy = useCallback((messageId: string, format: ContentFormat, content: string) => {
    openEditorFromResultRef.current(messageId, format, content)
  }, [])

  useAimHistoryLoad({ loadTargetId, generationIdParam, history: storeHistory, selectedAgentId, router, searchParams, lastAgentParamRef, clearLoadTarget, openEditorFromResult: syncEditorFromResultProxy, setters: routeSetters })
  useAimMessageAutoScroll({ scrollRef, pendingMessageIdRef: pendingScrollMessageIdRef, messages, isThinking, isGenerating })

  // ---- Persona progress ----
  const personaProgress = useMemo(() => {
    if (agent.id !== "persona") return null
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
    return lastAssistant ? extractProgress(lastAssistant.content) : null
  }, [messages, agent.id])

  // ---- clearCurrentTaskContext (shared by generation + workflow + reset) ----
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

  // ---- Generation actions ----
  const { generateWithInput, stopGeneration: handleStop, repurposeDeliverable: handleRepurpose, checkDeliverableQuality: handleQuality } = useAimGenerationActions({
    messages, setMessages, setInput, setSourceOriginalText, setSourceAnalysisText,
    setWorkflowBrief, setContentAction, setIsGenerating, setIsQualityChecking,
    agent, selectedAgentId, selectedProjectId, projectEnabled, currentWorkflowStage, agentModule,
    contentAction, workflowBrief, sourceVideoCopyExtractionId,
    sourceTopicTitle, sourceTopicRationale, selectedMethodologyProfileIds,
    topicSelectionId: topicSelectionIdParam, selectedTopicIndex: selectedTopicIndexParam,
    requestAbortRef, pendingScrollMessageIdRef, clearCurrentTaskContext,
    openEditorFromResult: syncEditorFromResultProxy, refreshHistory, refreshProjectWorkflow,
  })

  // ---- Workflow actions ----
  const { beginWorkflowStage, beginContentAction, handleAimNextAction, closeWorkflowBriefDialog, confirmWorkflowBrief } = useAimWorkflowActions({
    searchParams, router, lastAgentParamRef, selectedAgentId, selectedProjectId,
    agentTitle: agent.title, workflowBrief, workflowBriefForm,
    setSelectedAgentId, setMessages, setInput, setContentAction,
    setWorkflowBrief, setWorkflowBriefForm, setWorkflowBriefDialogOpen,
    setIsBuildingWorkflowBrief, clearCurrentTaskContext,
  })

  // ---- Evolution actions ----
  const { isEvolving, evolutionSuggestions, dismissEvolutionSuggestion, rememberWorkbenchPreference, handleEvolveConversation, handleSaveEvolutionSuggestion } = useAimEvolutionActions({ messages, selectedProjectId, projectEnabled })

  // ---- resetConversation (shared by page commands + header) ----
  const busy = isThinking || isGenerating || isQualityChecking || isTranscribing
  const clearTurnIntentRef = useRef<(() => void) | null>(null)

  function resetConversation() {
    requestAbortRef.current?.abort()
    setMessages([])
    setInput("")
    clearCurrentTaskContext()
    clearAimDraft(selectedAgentId, currentProjectScope)
    planOrchestration.planSession.resetPlan()
    planOrchestration.setComposerMode("direct")
    clearTurnIntentRef.current?.()
  }

  const restoreScopeDraft = (nextDraft: AimDraft | null) => {
    setAgentModule(nextDraft?.agentModule)
    setMessages(nextDraft?.messages || [])
    setInput(nextDraft?.input || "")
    setSourceVideoCopyExtractionId(nextDraft?.videoCopyExtractionId)
    setSourceOriginalText(nextDraft?.sourceOriginalText || "")
    setSourceAnalysisText(nextDraft?.sourceAnalysisText || "")
    setSourceTopicTitle(nextDraft?.sourceTopicTitle || "")
    setSourceTopicRationale(nextDraft?.sourceTopicRationale || "")
    setEditorText(nextDraft?.editorText || "")
    setEditorFormat(nextDraft?.editorFormat)
    setEditorSourceMessageId(nextDraft?.editorSourceMessageId)
    setEditorPanelWidth(nextDraft?.editorPanelWidth ?? EDITOR_PANEL_DEFAULT_WIDTH)
    setEditorPanelOpen(nextDraft?.editorPanelOpen ?? false)
  }

  const afterScopeChange = () => {
    setReferenceSelection({ text: "", range: { start: 0, end: 0 } })
    setDraftSelection({ text: "", range: { start: 0, end: 0 } })
    setWorkflowBrief(null)
    setContentAction(null)
    clearImages()
    // 切换项目时废弃旧计划，防止跨客户上下文混用
    planOrchestration.planSession.abandonPlan()
    planOrchestration.setComposerMode("direct")
    clearTurnIntentRef.current?.()
  }

  const { changeProjectScope } = useAimProjectScopeSwitch({
    busy,
    currentProjectScope,
    draft: { selectedAgentId, selectedProjectId, agentModule, input, messages, videoCopyExtractionId: sourceVideoCopyExtractionId, sourceOriginalText, sourceAnalysisText, sourceTopicTitle, sourceTopicRationale, editorText, editorFormat, editorSourceMessageId, editorPanelWidth, editorPanelOpen },
    router,
    searchParams,
    setProjectEnabled,
    setSelectedProjectId,
    restoreDraft: restoreScopeDraft,
    afterScopeChange,
  })

  // ---- Page commands ----
  const { runWorkbenchCommand } = useAimPageCommands({
    messages,
    sourceOriginalText, sourceAnalysisText, editorText, editorPanelLabels,
    setInput, setMessages, setEditorPanelOpen, resetConversation,
    generateWithInput, handleQuality, integrateLatestAssistantDraftToEditor,
    fillReferenceTextFromConversation, saveEditorToDeliverable,
    handleReviseCurrentDraft, handleOptimizeOpening, rememberWorkbenchPreference,
  })

  // ---- Chat actions ----
  const { sendText } = useAimChatActions({
    messages, setMessages, setInput, setIsThinking,
    selectedAgentId, selectedProjectId, projectEnabled, agentModule,
    requestAbortRef, clearCurrentTaskContext, clearImages, runWorkbenchCommand,
  })

  const {
    inlineEditKey,
    setInlineEditKey,
    syncEditorFromResult,
    handleInlineContentSaved,
    handleInlineSelectionRewrite,
  } = useAimInlineEditorBridge({
    setMessages,
    setEditorText,
    setEditorFormat,
    setEditorSourceMessageId,
    setDraftSelection,
    editorPanelLabels,
    sendText,
  })

  const openEditorFromResult = useCallback((messageId: string, format: ContentFormat, content: string) => {
    syncEditorFromResult(messageId, format, content)
    setEditorPanelOpen(true)
  }, [setEditorPanelOpen, syncEditorFromResult])

  openEditorFromResultRef.current = syncEditorFromResult

  // ---- openProjectWorkflowTask ----
  async function openProjectWorkflowTask(id: string) {
    if (!selectedProjectId) return
    await refreshHistory({ force: true, projectId: selectedProjectId })
    requestLoad(id)
  }

  // ---- Plan mode ----
  const planOrchestration = useAimPlanOrchestration({
    input,
    setInput,
    selectedProjectId,
    projectEnabled,
    setWorkflowBrief,
    generateWithInput,
  })

  // ---- Send actions ----
  const { handleUseSkill, handleGenerate, retryFailedMessage } = useAimSendActions({
    messages, input, hasEditorSelection, referenceSelection, draftSelection,
    editorText, sourceOriginalText, sourceAnalysisText, sourceTopicTitle,
    editorPanelLabels, imageAttachments, setInput, sendText, generateWithInput, runWorkbenchCommand,
  })

  const {
    pendingTurnIntent,
    intentResolving,
    clearPendingTurnIntent,
    handleConfirmTurnIntent,
    handleCancelTurnIntent,
    handleGenerateOrPlan: handleGenerateWithIntentGate,
  } = useAimTurnIntentGate({
    hasEditorSelection,
    imageCount: imageAttachments.length,
    handleGenerate,
    text: input,
    messageCount: messages.length,
    runWorkbenchCommand,
    defaultFormats: agent.defaultFormats,
    projectEnabled,
    selectedProjectId,
    generateWithInput,
  })
  clearTurnIntentRef.current = clearPendingTurnIntent

  /** 统一的生成入口：显式计划指令/开关优先，其余请求走直接模式意图门闩。 */
  const handleGenerateOrPlan = useCallback(() => {
    planOrchestration.handleGenerateOrPlan(handleGenerateWithIntentGate)
  }, [handleGenerateWithIntentGate, planOrchestration])

  // ---- Derived flags ----
  const retryFailed = useCallback((message: ChatMessage) => retryFailedMessage(message, busy), [busy, retryFailedMessage])
  const hasEditor = Boolean(sourceOriginalText.trim() || editorText.trim())
  const latestGenerationId = [...messages].reverse().find((message) => message.deliverables?.id)?.deliverables?.id
  const editorGenerationId = editorSourceMessageId
    ? messages.find((message) => message.id === editorSourceMessageId)?.deliverables?.id
    : undefined

  const projectAttach = useAimProjectAttach({
    projects,
    refreshProjects,
    onAttached: (projectId, generationId) => {
      setProjectEnabled(true)
      setSelectedProjectId(projectId)
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.delete("mode")
      nextParams.set("projectId", projectId)
      nextParams.set("generationId", generationId)
      router.replace(`/aim?${nextParams.toString()}`)
      void refreshHistory({ force: true, projectId })
    },
  })

  return {
    params,
    selectedAgentId, messages, input,
    imageAttachments, isUploadingImage, addImages, removeImage,
    sourceOriginalText, sourceAnalysisText, sourceTopicTitle, sourceTopicRationale, sourceVideoCopyExtractionId,
    editorText, editorFormat, editorSourceMessageId, editorPanelWidth, editorPanelOpen,
    editorPanelLabels, referenceSelection, draftSelection, annotatedReferenceText,
    hasEditorSelection, hasEditor,
    isThinking, isGenerating, isQualityChecking, isRecording, isTranscribing, busy,
    agent,
    currentWorkflowStage, showWorkflowLanding,
    workflowBrief, workflowBriefForm, workflowBriefDialogOpen, isBuildingWorkflowBrief, contentAction,
    projects, selectedProjectId, projectEnabled, projectAccessError, projectWorkflowRecords, isLoadingProjectWorkflow,
    personaProgress,
    isEvolving, evolutionSuggestions,
    recordDialog, closeRecordDialog, decisionForm, setDecisionForm, publishForm, setPublishForm,
    retroForm, setRetroForm, outcomeForm, setOutcomeForm, outcomeWindow, setOutcomeWindow,
    retroRuleForm, setRetroRuleForm, handleMarkStatus, openRecordDialog, submitRecordDialog,
    wikiDialog,
    isImitating, isSavingEditor, imitateStyleId, setImitateStyleId, handleImitate, saveEditorToDeliverable, applyEditorReplacement, applyRestoredContent,
    scrollRef,
    startRecording, stopRecording,
    setEditorPanelOpen, setEditorPanelWidth, setEditorText, setReferenceSelection, setDraftSelection,
    setInput, setWikiDialog, setWorkflowBriefForm,
    setMessages,
    changeProjectScope,
    projectAttach,
    resetConversation, retryFailed, handleGenerate: handleGenerateOrPlan, handleStop, handleRepurpose, handleQuality,
    sendText, handleUseSkill, openEditorFromResult, openProjectWorkflowTask,
    inlineEditKey, setInlineEditKey, handleInlineContentSaved, handleInlineSelectionRewrite,
    // 计划模式
    composerMode: planOrchestration.composerMode,
    setComposerMode: planOrchestration.setComposerMode,
    canUsePlanMode: planOrchestration.canUsePlanMode,
    planSession: planOrchestration.planSession,
    handlePlanConfirm: planOrchestration.handlePlanConfirm,
    handlePlanAbandon: planOrchestration.handlePlanAbandon,
    // 本轮意图确认
    pendingTurnIntent, handleConfirmTurnIntent, handleCancelTurnIntent, intentResolving,
    handleEvolveConversation, dismissEvolutionSuggestion, handleSaveEvolutionSuggestion,
    beginWorkflowStage, beginContentAction, handleAimNextAction, closeWorkflowBriefDialog, confirmWorkflowBrief,
    latestDeliverableMessageId: findLatestAimVideoDeliverableMessageId(messages),
    latestGenerationId,
    editorGenerationId,
    agentModule,
    setAgentModule,
    selectedMethodologyProfileIds,
    setSelectedMethodologyProfileIds,
  }
}

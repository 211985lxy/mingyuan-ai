"use client"

import { useEffect, useState, useMemo, useRef, useCallback, startTransition } from "react"
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
import { aimDraftStorageKey, loadAimDraft, saveAimDraft } from "@/features/aim/aim-draft-storage"
import type {
  AimChatToolAction,
  AimDraft,
  AimImageAttachment,
  ChatMessage,
  RecordDialogMode,
} from "@/features/aim/aim-workbench-types"
import {
  generateAimContent,
  getVideoCopyExtraction,
  checkScriptQuality,
  polishScript,
  chatAim,
  chatAimStream,
  ApiError,
  recordAimRunEvent,
  updateAimWorkflowStatus,
  type AimGenerateResponse,
  type AimGeneration,
  type ContentFormat,
} from "@/lib/api/client"
import {
  AIM_CONTENT_ACTIONS,
  getWorkflowStageForAgent,
  isAimWorkflowStage,
} from "@/lib/aim-workflow"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { transcribeAudio } from "@/lib/api/client"
import { STYLE_GUIDE_LABELS, type StyleGuideId } from "@/lib/style-guide-config"
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
import { BENCHMARK_RECREATION_PREFILL, buildBenchmarkLengthRule, buildBenchmarkRecreationSopBlock } from "@/lib/aim-benchmark-length"
import { detectAimWorkbenchCommand, type AimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import { buildOpeningRecommendationPrompt } from "@/lib/aim-opening-recommendation"
import {
  EDITOR_PANEL_DEFAULT_WIDTH,
  applyFirstMatchingStructureToReference,
  applySelectionReplacement,
  extractEditorDraftFromAssistantText,
  extractReplacementDraft,
  type AimEditorContext,
  type TextSelectionRange,
} from "@/lib/aim-editor"
import { getAimEditorPanelLabels, type EditorPanelLabels } from "@/lib/aim-editor-labels"
import { FORMAT_LABELS, workflowStatusLabel } from "@/features/aim/aim-format-labels"
import {
  buildHistoryRawInput,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  extractProgress,
  formatAnalysisResultForPrompt,
  getHistoryContents,
} from "@/features/aim/aim-text-utils"
import { useAimProjectWorkflow } from "@/features/aim/hooks/use-aim-project-workflow"
import { useAimRecordDialog } from "@/features/aim/hooks/use-aim-record-dialog"
import { useAimEvolution } from "@/features/aim/hooks/use-aim-evolution"
import { useAimImageAttachments } from "@/features/aim/hooks/use-aim-image-attachments"
import { useAimWorkflowActions } from "@/features/aim/hooks/use-aim-workflow-actions"
import {
  buildBenchmarkQualityMessage,
  buildBenchmarkRewriteInput,
  buildChatContent,
  detectLarkToolAction,
  getOpeningSegment,
} from "@/features/aim/aim-command-utils"

interface AimAgentOption extends AimAgentMeta, AimAgentGuide {}

const AGENT_OPTIONS: AimAgentOption[] = AIM_AGENT_OPTIONS.map((meta) => ({
  ...meta,
  ...getAimAgentGuide(meta.id),
}))

const RESEARCH_HINT_AGENT_IDS = new Set<AimAgentId>(["business_system_diagnosis", "business_diagnosis"])
const ACCEPTED_WORKFLOW_STATUSES = new Set(["ready_to_shoot", "ready_to_publish", "published"])

function reportAimRunEvent(
  runId: string | null | undefined,
  event: "copied" | "revised" | "accepted",
  metadata?: Record<string, unknown>,
) {
  if (!runId) return
  void recordAimRunEvent(runId, event, metadata).catch(() => undefined)
}

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
  const [isImitating, setIsImitating] = useState(false)
  const [imitateStyleId, setImitateStyleId] = useState("default")

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

  useEffect(() => {
    saveAimDraft({
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
  }, [
    editorFormat,
    editorPanelOpen,
    editorPanelWidth,
    editorSourceMessageId,
    editorText,
    input,
    messages,
    selectedAgentId,
    selectedProjectId,
    sourceOriginalText,
    sourceAnalysisText,
    sourceTopicTitle,
    sourceTopicRationale,
    sourceVideoCopyExtractionId,
  ])

  useEffect(() => {
    if (!sourceVideoCopyExtractionId || (sourceOriginalText.trim() && sourceAnalysisText.trim())) return
    getVideoCopyExtraction(sourceVideoCopyExtractionId)
      .then((record) => {
        const analysisText = formatAnalysisResultForPrompt(record.analysisResult) || ""
        if (!sourceOriginalText.trim()) setSourceOriginalText(record.transcript || "")
        if (!sourceAnalysisText.trim()) setSourceAnalysisText(analysisText)
      })
      .catch(() => {})
  }, [sourceAnalysisText, sourceOriginalText, sourceVideoCopyExtractionId])

  // 切换智能体（由全局侧边栏的 ?agent= 驱动）：同步选中态并重置当前对话
  useEffect(() => {
    if (lastAgentParamRef.current === agentParam) return
    lastAgentParamRef.current = agentParam
    const nextDraft = loadAimDraft(activeAgentId)
    startTransition(() => {
      setSelectedAgentId(activeAgentId)
      setSelectedProjectId(nextDraft?.selectedProjectId || selectedProjectId)
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
      setEditorPanelOpen(nextDraft?.editorPanelOpen ?? true)
    })
  }, [activeAgentId, agentParam, selectedProjectId])

  useEffect(() => {
    if (!topicTitleParam && !topicRationaleParam && !projectIdParam && !ideaParam) return

    const prefillLines = [
      topicTitleParam ? `选题：${topicTitleParam}` : null,
      topicRationaleParam ? `选题依据：${topicRationaleParam}` : null,
      ideaParam ? `创作灵感：${ideaParam}` : null,
    ].filter(Boolean)

    startTransition(() => {
      if (projectIdParam) setSelectedProjectId(projectIdParam)
      setMessages([])
      setInput(prefillLines.join("\n"))
      setSourceTopicTitle(topicTitleParam || ideaParam || "")
      setSourceTopicRationale(topicRationaleParam || "")
      setSourceVideoCopyExtractionId(undefined)
      setSourceOriginalText("")
      setSourceAnalysisText("")
      setEditorText("")
      setEditorFormat(undefined)
      setEditorSourceMessageId(undefined)
    })

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete("topicTitle")
    nextParams.delete("topicRationale")
    nextParams.delete("projectId")
    nextParams.delete("idea")
    router.replace(nextParams.toString() ? `/aim?${nextParams.toString()}` : "/aim")
  }, [projectIdParam, router, searchParams, topicRationaleParam, topicTitleParam, ideaParam])

  useEffect(() => {
    if (!videoCopyExtractionIdParam) return

    getVideoCopyExtraction(videoCopyExtractionIdParam)
      .then((record) => {
        const lengthRule = buildBenchmarkLengthRule(record.transcript)
        const recreationSop = buildBenchmarkRecreationSopBlock()
        const prefill = [
          BENCHMARK_RECREATION_PREFILL.short,
          "",
          "创作原则：",
          recreationSop,
          "1. 开头机制可以借，但第一句话必须重写成我的身份和业务场景里的话。",
          "2. 结构节奏可以保留，但表达至少 30% 可感知重写：案例、转折、句式和行动引导不能贴原文。",
          "3. 除专有名词外，不要连续沿用原文 12 个字以上，最终稿要像我的内容，不像原文换皮。",
          lengthRule ? `4. ${lengthRule}` : null,
          "",
          record.videoTitle ? `对标标题：${record.videoTitle}` : null,
          "对标原文：",
          record.transcript || "",
          record.analysisResult ? "\n已有拆解：" : null,
          formatAnalysisResultForPrompt(record.analysisResult),
        ].filter(Boolean).join("\n")

        startTransition(() => {
          setSelectedAgentId("content_producer")
          setMessages([])
          setInput(prefill)
          setSourceVideoCopyExtractionId(record.id)
          setSourceTopicTitle(record.videoTitle || "")
          setSourceTopicRationale("")
          setSourceOriginalText(record.transcript || "")
          setSourceAnalysisText(formatAnalysisResultForPrompt(record.analysisResult) || "")
          setEditorText("")
          setEditorFormat(undefined)
          setEditorSourceMessageId(undefined)
          setEditorPanelOpen(true)
        })
        toast.success("已带入对标文案")
      })
      .catch(() => toast.error("对标文案加载失败"))
      .finally(() => {
        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.delete("videoCopyExtractionId")
        router.replace(nextParams.toString() ? `/aim?${nextParams.toString()}` : "/aim")
      })
  }, [router, searchParams, videoCopyExtractionIdParam])

  const openEditorFromResult = useCallback((messageId: string, format: ContentFormat, content: string) => {
    setEditorText(content)
    setEditorFormat(format)
    setEditorSourceMessageId(messageId)
    setEditorPanelOpen(true)
    setDraftSelection({ text: "", range: { start: 0, end: 0 } })
  }, [])

  // 侧边栏点击「最近内容」：把记录加载为一次对话（数据来自共享 store，无需额外请求）
  useEffect(() => {
    if (!loadTargetId) return
    const item = storeHistory.find((h) => h.id === loadTargetId)
    if (!item) return // 列表尚未拉取到，等 storeHistory 更新后由本 effect 重试
    const contents = getHistoryContents(item)
    const assistantId = nextId()
    const itemAgentId = isValidAimAgent(item.agentId) ? item.agentId : DEFAULT_AIM_AGENT
    const historyOriginalText = extractBenchmarkOriginalText(item.rawInput)
    const historyAnalysisText = extractBenchmarkAnalysisText(item.rawInput)
    startTransition(() => {
      setSelectedAgentId(itemAgentId)
      setSelectedProjectId(item.projectId || "")
      setSourceTopicTitle(item.topicTitle || "")
      setSourceTopicRationale("")
      setSourceOriginalText(historyOriginalText)
      setSourceAnalysisText(historyAnalysisText)
      setMessages([
        { id: nextId(), role: "user", content: item.rawInput || "（历史素材）" },
        ...(contents.length
          ? [{
              id: assistantId,
              role: "assistant" as const,
              content: `已加载历史记录${item.topicTitle ? `「${item.topicTitle}」` : ""}，可继续改写或追问。`,
              agentId: item.agentId ?? undefined,
              deliverables: {
                id: item.id,
                results: contents.map((c) => ({ format: c.format, content: c.content, wordCount: c.content.length })),
                knowledgeUsed: [],
              } as AimGenerateResponse,
            }]
          : [{ id: nextId(), role: "assistant" as const, content: "已加载历史素材，可直接让我改写。" }]),
      ])
      if (contents[0]) openEditorFromResult(assistantId, contents[0].format, contents[0].content)
    })
    if (itemAgentId !== selectedAgentId) {
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.set("agent", itemAgentId)
      lastAgentParamRef.current = itemAgentId
      router.replace(`/aim?${nextParams.toString()}`)
    }
    toast.success("已加载历史记录")
    clearLoadTarget()
  }, [clearLoadTarget, loadTargetId, openEditorFromResult, router, searchParams, selectedAgentId, storeHistory])

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

  /** 把对话里的用户输入拼成生成素材 */
  function buildRawInputForGenerate(extra?: string) {
    const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content)
    if (extra) userTexts.push(extra)
    return userTexts.filter(Boolean).join("\n\n")
  }

  function latestDeliverableId() {
    return [...messages].reverse().find((m) => m.deliverables?.id)?.deliverables?.id
  }

  function latestDeliverableMessageId() {
    return [...messages]
      .reverse()
      .find((message) => message.deliverables?.results.some((result) => result.format === "video_script"))
      ?.id
  }

  function latestDeliverableText() {
    const latest = [...messages].reverse().find((message) => message.deliverables?.results.length)
    return latest?.deliverables?.results[0]?.content.trim() || ""
  }

  function fillReferenceTextFromConversation() {
    const source = [...messages]
      .reverse()
      .map((message) => extractBenchmarkOriginalText(message.content))
      .find((content) => content.trim())
    if (!source) {
      toast.error(`当前对话里没有可识别的${editorPanelLabels.referenceTitle}`)
      return true
    }
    setSourceOriginalText(source)
    setEditorPanelOpen(true)
    setInput("")
    toast.success(`已填入右侧${editorPanelLabels.referenceTitle}`)
    return true
  }

  function integrateLatestAssistantDraftToEditor() {
    const draft = [...messages]
      .reverse()
      .filter((message) => message.role === "assistant")
      .map((message) => extractEditorDraftFromAssistantText(message.content))
      .find((content) => content.trim())

    if (!draft) {
      toast.error(`没有找到可整合的最新版${editorPanelLabels.draftTitle}`)
      return true
    }

    setEditorText(draft)
    setEditorPanelOpen(true)
    setInput("")
    toast.success(`已整合到右侧${editorPanelLabels.title}`)
    return true
  }

  function handleImitate() {
    const viralSourceText = sourceOriginalText.trim()
    if (viralSourceText.length < 30) {
      toast.error("请先在对标面板加载一条对标爆款原文")
      return
    }
    if (editorText.trim().length < 30) {
      toast.error("草稿太短，请先写一些你行业的方向作为仿写参考")
      return
    }
    setIsImitating(true)
    void polishScript({
      mode: "imitate",
      content: editorText,
      viralSourceText,
      persona: agent.defaultInstruction,
      projectId: selectedProjectId || undefined,
      topicTitle: sourceTopicTitle || undefined,
      ...(imitateStyleId !== "default" ? { styleId: imitateStyleId as StyleGuideId } : {}),
    })
      .then((result) => {
        setEditorText(result.polished)
        toast.success("已把对标爆款的结构逻辑迁移到你的稿子")
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "仿写失败，请重试")
      })
      .finally(() => setIsImitating(false))
  }

  function saveEditorToDeliverable() {
    if (!editorSourceMessageId || !editorFormat) {
      toast.error("当前编辑稿还没有关联交付物")
      return false
    }
    setMessages((prev) =>
      prev.map((message) =>
        message.id === editorSourceMessageId && message.deliverables
          ? {
              ...message,
              deliverables: {
                ...message.deliverables,
                results: message.deliverables.results.map((result) =>
                  result.format === editorFormat
                    ? { ...result, content: editorText, wordCount: editorText.length }
                    : result
                ),
              },
            }
          : message
      )
    )
    toast.success("已保存到交付物")
    return true
  }

  function handleOptimizeOpening(commandInput: string) {
    const sourceText = editorText.trim() || latestDeliverableText()
    if (!sourceText) {
      toast.error("当前没有可优化的内容，请先生成脚本或写入编辑区")
      return true
    }
    const { segment } = getOpeningSegment(sourceText)
    if (segment.length < 20) {
      toast.error("当前稿子太短，找不到可优化的开头")
      return true
    }

    setIsGenerating(true)
    void chatAim([
      {
        role: "user",
        content: buildOpeningRecommendationPrompt({
          commandInput,
          openingSegment: segment,
          fullText: sourceText,
        }),
      },
    ], {
      agentId: "content_producer",
      projectId: projectEnabled ? selectedProjectId || undefined : undefined,
    })
      .then((result) => {
        const recommendations = result.content.trim()
        if (!recommendations) throw new Error("开头推荐结果为空")
        setEditorPanelOpen(true)
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "user",
            content: commandInput,
          },
          {
            id: nextId(),
            role: "assistant",
            content: recommendations,
            agentId: "content_producer",
          },
        ])
        toast.success("已生成开头推荐")
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "开头推荐失败")
      })
      .finally(() => setIsGenerating(false))

    return true
  }

  function handleReviseCurrentDraft(commandInput: string) {
    const draft = editorText.trim() || latestDeliverableText()
    if (!draft) {
      toast.error("当前没有可改写的稿子")
      return true
    }

    const prompt = [
      "请基于当前编辑稿完成这次定向改写，只输出“修改思路 + 替换稿”。",
      "硬要求：",
      "1. 如果要结合项目资料、人设、IP故事或来时路，必须自然融入正文推进、案例、判断和身份表达里，不要单独堆履历或标签。",
      "2. 如果用户表达了“别越改越短”“保持原稿长度/体量”“不要压缩”的意思，就默认保留当前稿子的主体信息密度和篇幅，除非用户明确要求精简。",
      `3. 当前用户要求：${commandInput}`,
    ].join("\n")

    const controller = new AbortController()
    requestAbortRef.current = controller
    const assistantId = nextId()
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: commandInput },
      {
        id: assistantId,
        role: "assistant",
        content: "正在按当前稿子和项目资料定向改写…",
        agentId: selectedAgentId,
      },
    ])
    setInput("")
    setIsThinking(true)

    void chatAimStream([
      ...messages.map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: prompt },
    ], {
      agentId: selectedAgentId,
      projectId: projectEnabled ? selectedProjectId || undefined : undefined,
      editorContext: buildEditorContext("口令定向改稿"),
      signal: controller.signal,
      onDelta: (_delta, content) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content, agentId: selectedAgentId } : message
          )
        )
      },
    })
      .catch((error) => {
        const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
        const content = stopped ? "已停止本次改写。" : `改写失败：${error instanceof Error ? error.message : "请稍后重试"}`
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content, agentId: selectedAgentId } : message
          )
        )
      })
      .finally(() => {
        if (requestAbortRef.current === controller) requestAbortRef.current = null
        setIsThinking(false)
      })

    return true
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
      const rewriteInput = buildBenchmarkRewriteInput({
        sourceOriginalText,
        messages,
        sourceAnalysisText,
        currentDraft: editorText.trim() || latestDeliverableText(),
      })
      if (rewriteInput) void generateWithInput(rewriteInput)
      return true
    }
    if (command.id === "run_quality_check") {
      const localCheckMessage = buildBenchmarkQualityMessage({
        sourceOriginalText,
        messages,
        draft: editorText.trim() || latestDeliverableText(),
      })
      const messageId = latestDeliverableMessageId()
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

  function buildEditorContext(action: string): AimEditorContext {
    return {
      action,
      referenceSelection: referenceSelection.text.trim() || undefined,
      draftSelection: draftSelection.text.trim() || undefined,
      draftText: editorText.trim() || undefined,
      documentType: editorPanelLabels.documentType,
      referenceLabel: editorPanelLabels.referenceTitle,
      draftLabel: editorPanelLabels.draftTitle,
    }
  }

  function applyEditorReplacement(message: ChatMessage) {
    const replacement = extractReplacementDraft(message.content)
    const range = message.editorApply?.range
    if (!replacement || !range) return
    setEditorText((current) => applySelectionReplacement(current, range, replacement))
    toast.success("已应用到右侧选区")
  }

  async function sendText(
    text: string,
    options?: {
      editorContext?: AimEditorContext
      editorApplyRange?: TextSelectionRange
      images?: AimImageAttachment[]
      retryMessageId?: string
    }
  ) {
    const images = options?.images ?? []
    if (!text && images.length === 0) return
    const workbenchCommand = detectAimWorkbenchCommand(text)
    if (workbenchCommand && runWorkbenchCommand(workbenchCommand)) return
    if (!options?.retryMessageId) {
      const revisedRun = [...messages].reverse().find((message) => message.deliverables && message.runId)?.runId
      reportAimRunEvent(revisedRun, "revised", { channel: "chat" })
    }
    const controller = new AbortController()
    requestAbortRef.current = controller
    const baseMessages = options?.retryMessageId
      ? messages.filter((message) => message.id !== options.retryMessageId)
      : messages
    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text || "请分析这张图片。", images }
    const thread = options?.retryMessageId ? baseMessages : [...baseMessages, userMsg]
    const assistantId = nextId()
    setMessages([
      ...thread,
      {
        id: assistantId,
        role: "assistant",
        content: "正在思考，会先读取上下文和资料，再给出回复…",
        editorApply: options?.editorApplyRange ? { range: options.editorApplyRange } : null,
      },
    ])
    setInput("")
    if (images.length) setImageAttachments([])
    setIsThinking(true)
    try {
      const toolAction = detectLarkToolAction(text)
      if (toolAction && projectEnabled && !selectedProjectId) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId ? { ...message, content: "需要先选择 IP 营销全案，才能执行这个飞书同步动作。" } : message
        ))
        return
      }
      const resultId = toolAction === "export_lark_generation" ? latestDeliverableId() : undefined
      if (toolAction === "export_lark_generation" && !resultId) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId ? { ...message, content: "当前没有可同步到飞书的 AIM 生成结果。" } : message
        ))
        return
      }
      const chatMessages = thread.map((m) => ({
        role: m.role,
        content: m.role === "user" && m.images?.length ? buildChatContent(m.content, m.images) : m.content,
      }))
      if (toolAction) {
        const { content } = await chatAim(chatMessages, {
          agentId: selectedAgentId,
          projectId: projectEnabled ? selectedProjectId || undefined : undefined,
          toolAction,
          resultId,
          editorContext: options?.editorContext,
          signal: controller.signal,
        })
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId ? { ...message, content } : message
        ))
        return
      }

      let hasContent = false
      await chatAimStream(chatMessages, {
        agentId: selectedAgentId,
        projectId: projectEnabled ? selectedProjectId || undefined : undefined,
        editorContext: options?.editorContext,
        signal: controller.signal,
        onDelta: (_delta, content) => {
          hasContent = content.length > 0
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

  async function generateWithInput(currentInput: string, options?: { retryMessageId?: string }) {
    const rawInput = buildRawInputForGenerate(currentInput || undefined)
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
    const baseMessages = options?.retryMessageId
      ? messages.filter((message) => message.id !== options.retryMessageId)
      : messages
    setMessages((prev) => [
      ...(options?.retryMessageId
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
        videoCopyExtractionId: sourceVideoCopyExtractionId,
        topicTitle: sourceTopicTitle.trim() || undefined,
        topicRationale: sourceTopicRationale.trim() || undefined,
        topicSelectionId: topicSelectionIdParam || undefined,
        selectedTopicIndex: Number.isFinite(selectedTopicIndexParam) ? selectedTopicIndexParam : undefined,
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
      const proofreadFormats = new Set<ContentFormat>(["raw_copy", "video_script", "koubo_script"])
      const proofreadResults = await Promise.all(
        response.results.map(async (result) => {
          if (!proofreadFormats.has(result.format) || result.content.trim().length < 30) return result
          try {
            const polished = await polishScript({
              content: result.content,
              persona: agent.defaultInstruction,
              mode: "proofread",
            })
            return {
              ...result,
              content: polished.polished,
              wordCount: polished.polished.length,
            }
          } catch {
            return result
          }
        }),
      )
      const correctedResponse = { ...response, results: proofreadResults }
      const extractedOriginalText = extractBenchmarkOriginalText(currentInput)
      const extractedAnalysisText = extractBenchmarkAnalysisText(currentInput)
      if (extractedOriginalText) setSourceOriginalText(extractedOriginalText)
      if (extractedAnalysisText) setSourceAnalysisText(extractedAnalysisText)
      const mainResult = response.results[0]
      setMessages((prev) => prev.map((message) =>
        message.id === assistantMessageId
          ? {
            ...message,
          content: `${agent.title} 交付物已生成，可直接复制使用，也能继续在下方对话里让我改写。`,
          agentId: agent.id,
          deliverables: correctedResponse,
          // aim-harness-v1: 捕获执行诊断，仅在低分/降级时向用户展示执行编号
          runId: response.runId ?? null,
          degraded: response.degraded ?? null,
          qualityStatus: response.qualityStatus ?? null,
          workflowStage: currentWorkflowStage,
          contentAction,
          }
          : message
      ))
      if (mainResult) {
        const correctedMainResult = correctedResponse.results[0] ?? mainResult
        openEditorFromResult(
          assistantMessageId,
          correctedMainResult.format,
          correctedMainResult.content,
        )
      }
      refreshHistory({ force: true, agentId: selectedAgentId })
      refreshProjectWorkflow()
      setWorkflowBrief(null)
      setContentAction(null)
      toast.success(`${agent.primaryActionLabel}完毕`)
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

  const handleMarkStatus = useCallback(
    (msgId: string) => async (status: string) => {
      const message = messages.find((m) => m.id === msgId)
      const base = message?.deliverables
      if (!base?.id || base.id.startsWith("polish-")) {
        toast.error("只有已保存的内容才能推进状态")
        return
      }
      try {
        await updateAimWorkflowStatus(base.id, { workflowStatus: status })
        if (ACCEPTED_WORKFLOW_STATUSES.has(status)) {
          reportAimRunEvent(message?.runId, "accepted", { workflowStatus: status })
        }
        refreshHistory({ force: true, agentId: selectedAgentId })
        refreshProjectWorkflow()
        toast.success(`已标记为：${workflowStatusLabel(status)}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "状态更新失败")
      }
    },
    [messages, refreshHistory, selectedAgentId],
  )

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
            latestDeliverableMessageId={latestDeliverableMessageId()}
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

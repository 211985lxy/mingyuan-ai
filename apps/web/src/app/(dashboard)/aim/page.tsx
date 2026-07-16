"use client"

import { useEffect, useState, useMemo, useRef, useCallback, startTransition } from "react"
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
  type WorkflowRecordDialogState,
  type WorkflowRecordMode,
} from "@/components/aim/workflow-record-dialog"
import {
  generateAimContent,
  getVideoCopyExtraction,
  checkScriptQuality,
  polishScript,
  uploadImageForAimChat,
  chatAim,
  chatAimStream,
  createKnowledge,
  createAimWorkflowBrief,
  evolveAimConversation,
  evolveStyleConversation,
  ApiError,
  listClientProjects,
  listAimHistory,
  updateAimWorkflowStatus,
  upsertContentOutcome,
  type AimCalibrationRule,
  type AimDecisionSnapshot,
  type AimEvolutionSuggestion,
  type AimGenerateResponse,
  type AimGeneration,
  type AimChatToolAction,
  type AimRetroSnapshot,
  type ClientProject,
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
import { transcribeAudio } from "@/lib/api/client"
import { type StyleGuideId } from "@/lib/style-guide-config"
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
import { BENCHMARK_RECREATION_PREFILL, buildBenchmarkLengthRule, buildBenchmarkRecreationSopBlock } from "@/lib/aim-benchmark-length"
import { assessBenchmarkRewrite } from "@/lib/aim-benchmark-quality"
import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import {
  detectAimWorkbenchCommand,
  shouldIsolateWritingInstruction,
  type AimWorkbenchCommand,
} from "@/lib/aim-workbench-commands"
import { buildOpeningRecommendationPrompt } from "@/lib/aim-opening-recommendation"
import {
  EDITOR_PANEL_DEFAULT_WIDTH,
  applyFirstMatchingStructureToReference,
  applySelectionReplacement,
  clampEditorPanelWidth,
  extractEditorDraftFromAssistantText,
  extractReplacementDraft,
  type AimEditorContext,
  type TextSelectionRange,
} from "@/lib/aim-editor"
import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"
import {
  AIM_ACTIVE_SOFT_ACTION_CLASS as ACTIVE_SOFT_ACTION_CLASS,
  AIM_FORMAT_LABELS as FORMAT_LABELS,
  getAimWorkflowStatusLabel as workflowStatusLabel,
} from "@/lib/aim/workbench-display"
import { reportAimRunEvent } from "@/lib/aim/run-events"
import { buildAimChatMessages, runAimChatRequest } from "@/lib/aim/chat-request"
import { proofreadAimResponse } from "@/lib/aim/generation-proofread"
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
const ACCEPTED_WORKFLOW_STATUSES = new Set(["ready_to_shoot", "ready_to_publish", "published"])

/** 从人设故事梳理的回复里解析【进度 XX%】，用于顶部进度条 */
function extractProgress(content: string): number | null {
  const m = content.match(/【进度\s*(\d+)\s*%】/)
  if (!m) return null
  const v = parseInt(m[1], 10)
  return Number.isNaN(v) ? null : Math.min(100, Math.max(0, v))
}

/** 生成一个稳定的临时 id（组件内使用，避免 Math.random 之外的库依赖） */
let _seq = 0
function nextId(prefix = "m") {
  _seq += 1
  return `${prefix}-${Date.now()}-${_seq}`
}

interface SendTextOptions {
  editorContext?: AimEditorContext
  editorApplyRange?: TextSelectionRange
  images?: AimImageAttachment[]
  retryMessageId?: string
}

const AIM_DRAFT_STORAGE_KEY_PREFIX = "aim-workbench-draft-v2"

interface AimDraft {
  selectedAgentId: AimAgentId
  selectedProjectId: string
  input: string
  messages: ChatMessage[]
  videoCopyExtractionId?: string
  sourceOriginalText?: string
  sourceAnalysisText?: string
  sourceTopicTitle?: string
  sourceTopicRationale?: string
  editorText?: string
  editorFormat?: ContentFormat
  editorSourceMessageId?: string
  editorPanelWidth?: number
  editorPanelOpen?: boolean
}

function aimDraftStorageKey(agentId: AimAgentId) {
  return `${AIM_DRAFT_STORAGE_KEY_PREFIX}:${agentId}`
}

function loadAimDraft(agentId: AimAgentId): AimDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(aimDraftStorageKey(agentId))
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<AimDraft>
    if (!isValidAimAgent(draft.selectedAgentId) || !Array.isArray(draft.messages)) return null
    return {
      selectedAgentId: draft.selectedAgentId,
      selectedProjectId: typeof draft.selectedProjectId === "string" ? draft.selectedProjectId : "",
      input: typeof draft.input === "string" ? draft.input : "",
      messages: draft.messages,
      videoCopyExtractionId: typeof draft.videoCopyExtractionId === "string" ? draft.videoCopyExtractionId : undefined,
      sourceOriginalText: typeof draft.sourceOriginalText === "string" ? draft.sourceOriginalText : undefined,
      sourceAnalysisText: typeof draft.sourceAnalysisText === "string" ? draft.sourceAnalysisText : undefined,
      sourceTopicTitle: typeof draft.sourceTopicTitle === "string" ? draft.sourceTopicTitle : undefined,
      sourceTopicRationale: typeof draft.sourceTopicRationale === "string" ? draft.sourceTopicRationale : undefined,
      editorText: typeof draft.editorText === "string" ? draft.editorText : undefined,
      editorFormat: typeof draft.editorFormat === "string" ? draft.editorFormat as ContentFormat : undefined,
      editorSourceMessageId: typeof draft.editorSourceMessageId === "string" ? draft.editorSourceMessageId : undefined,
      editorPanelWidth: typeof draft.editorPanelWidth === "number" ? clampEditorPanelWidth(draft.editorPanelWidth) : undefined,
      editorPanelOpen: typeof draft.editorPanelOpen === "boolean" ? draft.editorPanelOpen : undefined,
    }
  } catch {
    return null
  }
}

function saveAimDraft(draft: AimDraft) {
  if (typeof window === "undefined") return
  try {
    const storageKey = aimDraftStorageKey(draft.selectedAgentId)
    if (
      !draft.input.trim()
      && draft.messages.length === 0
      && !draft.editorText?.trim()
      && !draft.sourceOriginalText?.trim()
      && !draft.sourceAnalysisText?.trim()
      && !draft.sourceTopicTitle?.trim()
      && !draft.sourceTopicRationale?.trim()
    ) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft))
  } catch {
    // ponytail: losing a browser draft is better than breaking the editor.
  }
}

function formatAnalysisResultForPrompt(analysisResult: unknown) {
  if (!analysisResult) return null
  if (typeof analysisResult === "object" && "markdown" in analysisResult) {
    const markdown = (analysisResult as { markdown?: unknown }).markdown
    if (typeof markdown === "string" && markdown.trim()) return cleanVideoCopyAnalysisMarkdown(markdown)
  }
  return JSON.stringify(analysisResult, null, 2)
}

function extractBenchmarkOriginalText(text: string) {
  const marker = text.match(/对标原文[：:]/)
  if (marker?.index == null) return ""
  const start = marker.index + marker[0].length
  const rest = text.slice(start).trim()
  const nextSection = rest.search(/\n(?:已有拆解|结构化拆解|改写原则|创作原则|===|来源链接|硬规则)[：:：]?/)
  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim()
}

function extractBenchmarkAnalysisText(text: string) {
  const marker = text.match(/(?:已有拆解|结构化拆解)[：:]/)
  if (marker?.index != null) return text.slice(marker.index + marker[0].length).trim()
  const numberedStructure = text.match(/(?:^|\n)\d+[.、]\s*.+\n内容[：:]/)
  return numberedStructure?.index == null ? "" : text.slice(numberedStructure.index).trim()
}

function getHistoryContents(item: AimGeneration) {
  return [
    item.videoScript ? { format: "video_script" as const, content: item.videoScript } : null,
    item.wechatArticle ? { format: "wechat_article" as const, content: item.wechatArticle } : null,
    item.momentsPost ? { format: "moments_post" as const, content: item.momentsPost } : null,
    item.communityMessage ? { format: "community_message" as const, content: item.communityMessage } : null,
    item.shootingBrief ? { format: "shooting_brief" as const, content: item.shootingBrief } : null,
    item.rawCopy ? { format: "raw_copy" as const, content: item.rawCopy } : null,
  ].filter(Boolean) as Array<{ format: ContentFormat; content: string }>
}

function buildHistoryRawInput(baseInput: string, currentInput: string, messages: ChatMessage[]) {
  const turns = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const text = message.content.trim()
      const deliverableNote = message.deliverables?.results.length
        ? `生成了：${message.deliverables.results.map((result) => FORMAT_LABELS[result.format] || result.format).join("、")}`
        : ""
      const content = [text, deliverableNote].filter(Boolean).join("\n")
      if (!content) return ""
      return `${message.role === "user" ? "用户" : "助手"}：${content}`
    })
    .filter(Boolean)

  const current = currentInput.trim() ? [`用户：${currentInput.trim()}`] : []
  if (turns.length === 0 && current.length === 0) return baseInput
  return [`【本轮对话】`, ...turns, ...current, "", `【本次生成输入】`, baseInput].join("\n")
}

function prepareChatTurn(input: {
  messages: ChatMessage[]
  text: string
  images: AimImageAttachment[]
  retryMessageId?: string
  startsNewTask: boolean
  editorApplyRange?: TextSelectionRange
}) {
  const baseMessages = input.startsNewTask
    ? []
    : input.retryMessageId
      ? input.messages.filter((message) => message.id !== input.retryMessageId)
      : input.messages
  const userMessage: ChatMessage = {
    id: nextId(),
    role: "user",
    content: input.text || "请分析这张图片。",
    images: input.images,
  }
  const thread = input.retryMessageId ? baseMessages : [...baseMessages, userMessage]
  const assistantId = nextId()
  return {
    assistantId,
    thread,
    pendingMessages: [...thread, {
      id: assistantId,
      role: "assistant" as const,
      content: "正在思考，会先读取上下文和资料，再给出回复…",
      editorApply: input.editorApplyRange ? { range: input.editorApplyRange } : null,
    }],
  }
}

function reportChatRevision(messages: ChatMessage[], retryMessageId: string | undefined, startsNewTask: boolean) {
  if (retryMessageId || startsNewTask) return
  const revisedRun = [...messages].reverse().find((message) => message.deliverables && message.runId)?.runId
  reportAimRunEvent(revisedRun, "revised", { channel: "chat" })
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
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [projectWorkflowRecords, setProjectWorkflowRecords] = useState<AimGeneration[]>([])
  const [isLoadingProjectWorkflow, setIsLoadingProjectWorkflow] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(() => initialDraft?.selectedProjectId || "")
  const [wikiDialog, setWikiDialog] = useState<{ open: boolean; context: IpWikiDialogContext | null }>({
    open: false,
    context: null,
  })
  const [recordDialog, setRecordDialog] = useState<WorkflowRecordDialogState | null>(null)
  const [decisionForm, setDecisionForm] = useState<AimDecisionSnapshot>({
    summary: "",
    targetUser: "",
    expectedSignal: "",
    confidence: "",
  })
  const [publishForm, setPublishForm] = useState({
    publishPlatform: "抖音",
    publishUrl: "",
  })
  const [retroForm, setRetroForm] = useState<AimRetroSnapshot>({
    summary: "",
    actualData: "",
    verdict: "",
    nextRule: "",
  })
  const [outcomeForm, setOutcomeForm] = useState<Record<string, string>>({})
  const [outcomeWindow, setOutcomeWindow] = useState<"7" | "14" | "30">("7")
  const [retroRuleForm, setRetroRuleForm] = useState<AimCalibrationRule>({
    rule: "",
    source: "内容复盘",
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
  const [projectEnabled, setProjectEnabled] = useState(false)
  const [isEvolving, setIsEvolving] = useState(false)
  const [evolutionSuggestions, setEvolutionSuggestions] = useState<AimEvolutionSuggestion[]>([])
  const [isImitating, setIsImitating] = useState(false)
  const [imitateStyleId, setImitateStyleId] = useState("default")

  // 历史记录由侧边栏共享 store 管理（侧边栏渲染列表、生成成功后刷新、点击后触发加载）
  const storeHistory = useAimWorkspaceStore((s) => s.history)
  const loadTargetId = useAimWorkspaceStore((s) => s.loadTargetId)
  const refreshHistory = useAimWorkspaceStore((s) => s.fetchHistory)
  const clearLoadTarget = useAimWorkspaceStore((s) => s.clearLoadTarget)
  const requestLoad = useAimWorkspaceStore((s) => s.requestLoad)

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

  useEffect(() => {
    listClientProjects()
      .then((items) => {
        setProjects(items)
        setProjectEnabled(items.length > 0)
        // Validate that the current selectedProjectId belongs to this user's projects.
        // It may be stale from sessionStorage (e.g. different user, or project deleted).
        setSelectedProjectId((current) => {
          if (current && items.some((p) => p.id === current)) return current
          return items[0]?.id || ""
        })
      })
      .catch(() => setProjectEnabled(false))
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectWorkflowRecords([])
      return
    }
    let active = true
    setIsLoadingProjectWorkflow(true)
    listAimHistory(1, 50, selectedProjectId)
      .then((items) => { if (active) setProjectWorkflowRecords(items) })
      .catch(() => { if (active) setProjectWorkflowRecords([]) })
      .finally(() => { if (active) setIsLoadingProjectWorkflow(false) })
    return () => { active = false }
  }, [selectedProjectId])

  const lastAgentParamRef = useRef(agentParam)

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
    if (typeof window !== "undefined") window.sessionStorage.removeItem(aimDraftStorageKey(selectedAgentId))
  }

  /** 把对话里的用户输入拼成生成素材 */
  function buildRawInputForGenerate(extra?: string) {
    const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content)
    if (extra) userTexts.push(extra)
    return userTexts.filter(Boolean).join("\n\n")
  }

  function detectLarkToolAction(text: string): AimChatToolAction | null {
    if (!/飞书/.test(text)) return null
    if (/同步.*选题|导入.*选题/.test(text)) return "import_lark_topics"
    if (/热点|竞品|优质账号|参考|数据/.test(text) && /导入|同步/.test(text)) return "import_lark_archive_data"
    if (/项目/.test(text) && /导入|同步/.test(text)) return "import_lark_project_data"
    if (/回写|同步到飞书|同步.*脚本|同步.*内容/.test(text)) return "export_lark_generation"
    return null
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

  function buildBenchmarkRewriteInput() {
    const original = sourceOriginalText.trim() || [...messages]
      .reverse()
      .map((message) => extractBenchmarkOriginalText(message.content))
      .find((content) => content.trim()) || ""

    if (!original) {
      toast.error("请先带入对标原文")
      return null
    }

    const currentDraft = editorText.trim() || latestDeliverableText()
    const lengthRule = buildBenchmarkLengthRule(original)

    return [
      "请按对标原文重新生成一版文案，直接输出最终稿。",
      "硬性要求：",
      buildBenchmarkRecreationSopBlock(),
      "1. 目标字数必须和对标原文基本一致，允许 95%-105% 波动。",
      "2. 整体至少 30% 可感知重写，不能只是替换少数字。",
      "3. 除专有名词外，不要连续沿用原文 12 个字以上。",
      lengthRule ? `4. ${lengthRule}` : null,
      sourceAnalysisText.trim() ? `已有拆解：\n${sourceAnalysisText.trim()}` : null,
      `对标原文：\n${original}`,
      currentDraft ? `我当前不满意的稿子：\n${currentDraft}` : null,
    ].filter(Boolean).join("\n\n")
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

  function buildBenchmarkQualityMessage() {
    const original = sourceOriginalText.trim() || [...messages]
      .reverse()
      .map((message) => extractBenchmarkOriginalText(message.content))
      .find((content) => content.trim()) || ""
    const draft = editorText.trim() || latestDeliverableText()

    if (!original || !draft) return null

    const report = assessBenchmarkRewrite(original, draft)
    const lengthRatio = report.lengthRatio == null ? "无法计算" : `${Math.round(report.lengthRatio * 100)}%`
    const lengthStatus = report.lengthPassed
      ? "通过"
      : report.outputChars < report.originalChars
        ? "偏短"
        : "偏长"
    const copyStatus = report.tooSimilar ? "风险高，需要继续重写" : "通过"

    return [
      "## 对标自检结果",
      `- 字数：当前 ${report.outputChars} 字 / 原文 ${report.originalChars} 字，比例 ${lengthRatio}，判定：${lengthStatus}。`,
      `- 12字连续复用：${Math.round(report.reuseRatio * 100)}%，判定：${copyStatus}。`,
      report.reusedSamples.length
        ? `- 复用片段示例：${report.reusedSamples.map((sample) => `「${sample}」`).join("、")}`
        : "- 复用片段示例：未发现明显连续复用。",
      report.lengthPassed && !report.tooSimilar
        ? "- 结论：这版在字数和照抄风险上基本合格，可以继续看表达质量。"
        : "- 结论：这版还不合格，优先按原文字数重写，并替换开头、案例、过渡句或行动引导。",
    ].join("\n\n")
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

  function getOpeningSegment(text: string) {
    const trimmed = text.trimStart()
    const offset = text.length - trimmed.length
    const paragraphs = trimmed.split(/\n\s*\n/)
    const first = paragraphs[0]?.trim() || ""
    const second = paragraphs[1]?.trim() || ""
    const segment = first.length < 80 && second ? `${first}\n\n${second}` : first
    return { offset, segment }
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
      const rewriteInput = buildBenchmarkRewriteInput()
      if (rewriteInput) void generateWithInput(rewriteInput)
      return true
    }
    if (command.id === "run_quality_check") {
      const localCheckMessage = buildBenchmarkQualityMessage()
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
      editorContext: buildEditorContext("用户追问"),
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
    if (selectedProjectId) void listAimHistory(1, 50, selectedProjectId).then(setProjectWorkflowRecords).catch(() => {})
    setWorkflowBrief(null)
    setContentAction(null)
    toast.success(`${agent.primaryActionLabel}完毕`)
  }

  async function generateWithInput(currentInput: string, options?: { retryMessageId?: string; startsNewTask?: boolean }) {
    const rawInput = options?.startsNewTask
      ? currentInput
      : buildRawInputForGenerate(currentInput || undefined)
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
        if (selectedProjectId) void listAimHistory(1, 50, selectedProjectId).then(setProjectWorkflowRecords).catch(() => {})
        toast.success(`已标记为：${workflowStatusLabel(status)}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "状态更新失败")
      }
    },
    [messages, refreshHistory, selectedAgentId],
  )

  const openRecordDialog = useCallback((msgId: string, mode: WorkflowRecordMode) => {
    const base = messages.find((m) => m.id === msgId)?.deliverables
    if (!base?.id || base.id.startsWith("polish-")) {
      toast.error("只有已保存的内容才能记录")
      return
    }

    if (mode === "decision") {
      const spec = base.taskSpec
      setDecisionForm({
        summary: spec?.realProblem || spec?.goal || "",
        targetUser: spec?.targetCustomer || "",
        expectedSignal: spec?.desiredAction || "",
        confidence: spec?.riskLevel === "high" ? "低" : spec?.riskLevel === "medium" ? "中" : "高",
      })
    } else if (mode === "publish") {
      setPublishForm({
        publishPlatform: "抖音",
        publishUrl: "",
      })
    } else {
      setRetroForm({
        summary: "",
        actualData: "",
        verdict: "",
        nextRule: "",
      })
      setRetroRuleForm({
        rule: "",
        source: "内容复盘",
      })
      setOutcomeForm({})
      setOutcomeWindow("7")
    }

    setRecordDialog({ mode, generationId: base.id })
  }, [messages])

  const handleSubmitRecordDialog = useCallback(async () => {
    if (!recordDialog) return

    try {
      if (recordDialog.mode === "decision") {
        if (!decisionForm.summary.trim()) {
          toast.error("先写清楚为什么值得发")
          return
        }
        await updateAimWorkflowStatus(recordDialog.generationId, {
          decisionSnapshot: {
            summary: decisionForm.summary.trim(),
            targetUser: decisionForm.targetUser?.trim(),
            expectedSignal: decisionForm.expectedSignal?.trim(),
            confidence: decisionForm.confidence?.trim(),
          },
        })
        toast.success("已记下发布前判断")
      } else if (recordDialog.mode === "publish") {
        await updateAimWorkflowStatus(recordDialog.generationId, {
          workflowStatus: "published",
          publishPlatform: publishForm.publishPlatform.trim() || "抖音",
          publishUrl: publishForm.publishUrl.trim(),
        })
        const publishedMessage = messages.find((message) => message.deliverables?.id === recordDialog.generationId)
        reportAimRunEvent(publishedMessage?.runId, "accepted", { workflowStatus: "published" })
        toast.success("已登记发布")
      } else {
        if (!retroForm.summary.trim()) {
          toast.error("先写清楚这次结果怎么判断")
          return
        }
        await updateAimWorkflowStatus(recordDialog.generationId, {
          retroSnapshot: {
            summary: retroForm.summary.trim(),
            actualData: retroForm.actualData?.trim(),
            verdict: retroForm.verdict?.trim(),
            nextRule: retroForm.nextRule?.trim(),
          },
          calibrationRule: retroRuleForm.rule.trim()
            ? {
                rule: retroRuleForm.rule.trim(),
                source: retroRuleForm.source?.trim() || "内容复盘",
              }
            : undefined,
        })
        const hasOutcome = Object.values(outcomeForm).some((v) => v && v.trim())
        if (hasOutcome) {
          const num = (key: string) => {
            const raw = outcomeForm[key]
            if (!raw || !raw.trim()) return null
            const n = Number(raw)
            return Number.isFinite(n) ? n : null
          }
          await upsertContentOutcome(recordDialog.generationId, {
            collectWindowDay: Number(outcomeWindow) as 7 | 14 | 30,
            platform: publishForm.publishPlatform.trim() || undefined,
            dmCount: num("dmCount"),
            qualifiedLeadCount: num("qualifiedLeadCount"),
            appointmentCount: num("appointmentCount"),
            dealCount: num("dealCount"),
            revenue: num("revenue"),
            views: num("views"),
            saves: num("saves"),
            comments: num("comments"),
            shares: num("shares"),
            audienceFeedback: outcomeForm.audienceFeedback?.trim() || undefined,
          }).catch((e) => {
            console.error("[retro] outcome save failed (non-blocking)", e)
          })
        }
        toast.success("已保存复盘")
      }

      setRecordDialog(null)
      refreshHistory({ force: true, agentId: selectedAgentId })
      if (selectedProjectId) void listAimHistory(1, 50, selectedProjectId).then(setProjectWorkflowRecords).catch(() => {})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    }
  }, [decisionForm, messages, outcomeForm, outcomeWindow, publishForm, recordDialog, refreshHistory, retroForm, retroRuleForm, selectedAgentId])

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
          latestDeliverableMessageId={latestDeliverableMessageId()}
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
        onClose={() => setRecordDialog(null)}
        onSubmit={() => void handleSubmitRecordDialog()}
      />
    </div>
  )
}

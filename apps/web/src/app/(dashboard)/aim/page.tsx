"use client"

import { useEffect, useState, memo, useMemo, useRef, useCallback, startTransition } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Check,
  Clipboard,
  Database,
  FileText,
  Loader2,
  Sparkles,
  ShieldCheck,
  Target,
  Plus,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { KNOWLEDGE_STRATEGY_PROFILES } from "@/lib/aim-knowledge-strategy"
import { buildAimDeliveryContract } from "@/lib/aim-delivery-contract"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Textarea } from "@/components/ui/textarea"
import { IpWikiDialog, type IpWikiDialogContext } from "./ip-wiki-dialog"
import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { ActionStrip } from "@/components/workbench/action-strip"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  generateAimContent,
  getVideoCopyExtraction,
  checkScriptQuality,
  polishScript,
  uploadImageForAimChat,
  chatAim,
  chatAimStream,
  createKnowledge,
  evolveAimConversation,
  evolveStyleConversation,
  ApiError,
  listClientProjects,
  recordAimRunEvent,
  updateAimWorkflowStatus,
  type AimCalibrationRule,
  type AimDecisionSnapshot,
  type AimEvolutionSuggestion,
  type AimGenerateResponse,
  type AimGeneration,
  type AimChatToolAction,
  type AimChatContent,
  type AimRetroSnapshot,
  type ClientProject,
  type ContentFormat,
  type QualityCheckReport,
} from "@/lib/api/client"
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
  buildAimNextActionPrompt,
  getAimAgentGuide,
  type AimAgentGuide,
  type AimNextAction,
  type AimWorkbenchSkill,
} from "@/lib/aim-agent-guides"
import { useAimWorkspaceStore } from "@/lib/aim-workspace-store"
import { BENCHMARK_RECREATION_PREFILL, buildBenchmarkLengthRule, buildBenchmarkRecreationSopBlock } from "@/lib/aim-benchmark-length"
import { assessBenchmarkRewrite } from "@/lib/aim-benchmark-quality"
import { shouldOpenDeepCopywriter } from "@/lib/video-copy-routing"
import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import { detectAimWorkbenchCommand, type AimWorkbenchCommand } from "@/lib/aim-workbench-commands"
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
import { getAimEditorPanelLabels, type EditorPanelLabels } from "@/lib/aim-editor-labels"

interface AimAgentOption extends AimAgentMeta, AimAgentGuide {}

const AGENT_OPTIONS: AimAgentOption[] = AIM_AGENT_OPTIONS.map((meta) => ({
  ...meta,
  ...getAimAgentGuide(meta.id),
}))

const FORMAT_LABELS: Record<ContentFormat, string> = {
  video_script: "口播文案",
  wechat_article: "公众号文章",
  moments_post: "朋友圈文案",
  community_message: "社群运营文案",
  shooting_brief: "拍摄交接单",
  raw_copy: "诊断报告",
  koubo_script: "口播文案",
  xiaohongshu_post: "小红书图文",
}

const SOFT_ACTION_CLASS = "h-7 rounded-md border-0 bg-muted/45 px-2 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
const ACTIVE_SOFT_ACTION_CLASS = "h-7 rounded-md border-0 bg-primary/10 px-2 text-xs text-primary shadow-none hover:bg-primary/15"
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

const WORKFLOW_STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "pending_review", label: "待审核" },
  { value: "ready_to_shoot", label: "待拍摄" },
  { value: "shooting", label: "拍摄中" },
  { value: "editing", label: "剪辑中" },
  { value: "ready_to_publish", label: "待发布" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
]

function workflowStatusLabel(status?: string | null) {
  return WORKFLOW_STATUS_OPTIONS.find((item) => item.value === status)?.label || "草稿"
}

interface ChoiceGroup {
  question: string
  options: Array<{ label: string; text: string }>
}

function cleanChoiceText(text: string) {
  return text.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim()
}

/** 从人设故事梳理的回复里解析【进度 XX%】，用于顶部进度条 */
function extractProgress(content: string): number | null {
  const m = content.match(/【进度\s*(\d+)\s*%】/)
  if (!m) return null
  const v = parseInt(m[1], 10)
  return Number.isNaN(v) ? null : Math.min(100, Math.max(0, v))
}

function extractChoiceGroups(content: string): ChoiceGroup[] {
  const lines = content.split("\n")
  const groups: ChoiceGroup[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const first = lines[i].trim().match(/^([A-D])[\s.、．)]\s*(.+)$/)
    if (!first) continue

    const options = []
    let j = i
    while (j < lines.length) {
      const match = lines[j].trim().match(/^([A-D])[\s.、．)]\s*(.+)$/)
      if (!match) break
      const text = cleanChoiceText(match[2])
      if (text.length > 0 && text.length <= 120) options.push({ label: match[1], text })
      j += 1
    }

    let question = "请选择一个方向"
    for (let k = i - 1; k >= 0; k -= 1) {
      const line = cleanChoiceText(lines[k])
      if (line && !/^([A-D])[\s.、．)]/.test(line)) {
        question = line
        break
      }
    }
    if (options.length > 1) groups.push({ question, options })
    i = j
  }
  return groups
}

function splitMethodNote(content: string) {
  const match = content.match(/\[\[AIM_METHOD_NOTE\]\]([\s\S]*?)\[\[\/AIM_METHOD_NOTE\]\]/)
  if (!match) return { methodNote: "", result: content }
  return {
    methodNote: match[1].trim(),
    result: content.replace(match[0], "").trim(),
  }
}

/** 生成一个稳定的临时 id（组件内使用，避免 Math.random 之外的库依赖） */
let _seq = 0
function nextId(prefix = "m") {
  _seq += 1
  return `${prefix}-${Date.now()}-${_seq}`
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  images?: AimImageAttachment[]
  agentId?: string | null
  deliverables?: AimGenerateResponse | null
  qualityReport?: QualityCheckReport | null
  editorApply?: { range: TextSelectionRange } | null
  // aim-harness-v1: 执行诊断，仅在结果详情/低分/降级时向用户展示执行编号
  runId?: string | null
  degraded?: boolean | null
  qualityStatus?: "pass" | "warn" | "fail" | "skipped" | null
  failure?: { kind: "chat" | "generate"; retryText: string } | null
}

interface AimImageAttachment {
  id: string
  name: string
  assetUrl: string
  readUrl: string
  previewUrl: string
}

type RecordDialogMode = "decision" | "publish" | "retro"

interface RecordDialogState {
  mode: RecordDialogMode
  generationId: string
}

function ChoiceStepper({
  groups,
  busy,
  onSubmit,
}: {
  groups: ChoiceGroup[]
  busy: boolean
  onSubmit: (text: string) => void
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const group = groups[step]
  if (!group) return null

  const selected = answers[step]
  const isLast = step === groups.length - 1

  function next() {
    if (!selected) return
    if (!isLast) {
      setStep((current) => current + 1)
      return
    }
    onSubmit(groups.map((item, index) => `${index + 1}. ${item.question}\n${answers[index]}`).join("\n\n"))
  }

  return (
    <div className="mt-3 max-w-xl rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {step + 1}/{groups.length} · {group.question}
        </p>
        <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy || !selected} onClick={next}>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-2">
        {group.options.map((option) => {
          const value = `${option.label}. ${option.text}`
          return (
            <Button
              key={value}
              type="button"
              variant={selected === value ? "default" : "outline"}
              className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-xs"
              disabled={busy}
              onClick={() => setAnswers((current) => ({ ...current, [step]: value }))}
            >
              <span className="mr-1 font-semibold">{option.label}</span>
              {option.text}
            </Button>
          )
        })}
      </div>
    </div>
  )
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

interface EditorSelection {
  text: string
  range: TextSelectionRange
}

function readTextareaSelection(element: HTMLTextAreaElement): EditorSelection {
  const range = { start: element.selectionStart, end: element.selectionEnd }
  return { text: element.value.slice(range.start, range.end), range }
}

function BenchmarkEditorPanel({
  open,
  width,
  labels,
  referenceText,
  editorText,
  editorFormat,
  onOpen,
  onClose,
  onWidthChange,
  onEditorTextChange,
  onReferenceSelection,
  onDraftSelection,
  onSave,
  onImitate,
  imitating,
  imitateStyleId,
  onImitateStyleChange,
}: {
  open: boolean
  width: number
  labels: EditorPanelLabels
  referenceText: string
  editorText: string
  editorFormat?: ContentFormat
  onOpen: () => void
  onClose: () => void
  onWidthChange: (width: number) => void
  onEditorTextChange: (text: string) => void
  onReferenceSelection: (selection: EditorSelection) => void
  onDraftSelection: (selection: EditorSelection) => void
  onSave: () => void
  /** 跨行业爆款仿写：拿上面对标爆款的结构逻辑，重写下方草稿。仅当有对标原文时可用 */
  onImitate: () => void
  imitating: boolean
  imitateStyleId: string
  onImitateStyleChange: (styleId: string) => void
}) {
  const splitRef = useRef<HTMLDivElement>(null)
  const [referencePercent, setReferencePercent] = useState(50)

  if (!open) {
    return (
      <button
        type="button"
        className="flex w-9 shrink-0 flex-col items-center justify-center gap-2 border-l bg-background text-xs text-muted-foreground hover:bg-muted/40"
        onClick={onOpen}
        title={labels.collapsedTitle}
      >
        <FileText className="h-4 w-4" />
        <span className="[writing-mode:vertical-rl]">{editorText.length}字</span>
      </button>
    )
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l bg-background"
      style={{ width }}
    >
      <div
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/30"
        onPointerDown={(event) => {
          event.preventDefault()
          const move = (moveEvent: PointerEvent) => {
            onWidthChange(clampEditorPanelWidth(window.innerWidth - moveEvent.clientX))
          }
          const up = () => {
            window.removeEventListener("pointermove", move)
            window.removeEventListener("pointerup", up)
          }
          window.addEventListener("pointermove", move)
          window.addEventListener("pointerup", up)
        }}
      />
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{labels.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {editorFormat ? FORMAT_LABELS[editorFormat] : labels.currentLabel} · {editorText.length} 字
          </p>
        </div>
        <div className="flex items-center gap-1">
          {referenceText.length >= 30 ? (
            <>
              <Select value={imitateStyleId} onValueChange={(value) => onImitateStyleChange(value ?? "default")}>
                <SelectTrigger size="sm" className="h-7 w-[104px] text-xs">
                  <SelectValue placeholder="文风" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">默认（我的风格）</SelectItem>
                  {Object.entries(STYLE_GUIDE_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className={ACTIVE_SOFT_ACTION_CLASS}
                disabled={imitating || editorText.trim().length < 30}
                onClick={onImitate}
                title="把上面对标爆款的结构逻辑迁移到你的稿子"
              >
                {imitating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                仿写
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" className={ACTIVE_SOFT_ACTION_CLASS} onClick={onSave}>
            保存
          </Button>
          <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onClose}>
            隐藏
          </Button>
        </div>
      </div>
      <div
        ref={splitRef}
        className="grid min-h-0 flex-1 bg-muted/15"
        style={{ gridTemplateRows: `${referencePercent}% 6px minmax(0, 1fr)` }}
      >
        <section className="flex min-h-0 flex-col px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{labels.referenceTitle}</span>
            {referenceText ? <span className="text-[11px] text-muted-foreground">{referenceText.length} 字</span> : null}
          </div>
          <textarea
            readOnly
            className="min-h-0 flex-1 resize-none rounded-md border border-transparent bg-background/70 p-3 text-sm leading-6 outline-none focus:border-primary/25"
            value={referenceText}
            placeholder={labels.referencePlaceholder}
            onSelect={(event) => onReferenceSelection(readTextareaSelection(event.currentTarget))}
          />
        </section>
        <div
          className="group flex cursor-row-resize items-center bg-transparent transition-colors hover:bg-primary/5"
          title="拖动调整上下区域高度"
          onPointerDown={(event) => {
            event.preventDefault()
            const box = splitRef.current?.getBoundingClientRect()
            if (!box) return
            const move = (moveEvent: PointerEvent) => {
              const next = ((moveEvent.clientY - box.top) / box.height) * 100
              setReferencePercent(Math.min(80, Math.max(20, next)))
            }
            const up = () => {
              window.removeEventListener("pointermove", move)
              window.removeEventListener("pointerup", up)
            }
            window.addEventListener("pointermove", move)
            window.addEventListener("pointerup", up)
          }}
        >
          <div className="h-px w-full bg-border/60 transition-colors group-hover:bg-primary/35" />
        </div>
        <section className="flex min-h-0 flex-col px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{labels.draftTitle}</span>
            <span className="text-[11px] text-muted-foreground">{editorText.length} 字</span>
          </div>
          <textarea
            className="min-h-0 flex-1 resize-none rounded-md border border-transparent bg-background p-3 text-sm leading-6 outline-none focus:border-primary/25"
            value={editorText}
            onChange={(event) => onEditorTextChange(event.target.value)}
            onSelect={(event) => onDraftSelection(readTextareaSelection(event.currentTarget))}
            placeholder={labels.draftPlaceholder}
          />
        </section>
      </div>
    </aside>
  )
}

const ZhuJianContent = memo(function ZhuJianContent({ text }: { text: string }) {
  const lines = useMemo(() => (text ? text.split("\n") : []), [text])
  return (
    <div className="space-y-3 select-text font-serif leading-loose tracking-wider text-foreground/95 antialiased">
      {lines.map((line, index) => {
        const displayLine = line.replace(/\*\*/g, "")
        const regex = /(【[^】]+】)/g
        const parts = displayLine.split(regex)
        if (parts.length > 1) {
          return (
            <p key={index} className="text-sm sm:text-base leading-loose my-2 text-[#2c2b2a] dark:text-[#f3ede2]">
              {parts.map((part, pIdx) => {
                if (part.startsWith("【") && part.endsWith("】")) {
                  if (part === "【画面】") {
                    return (
                      <span key={pIdx} className="inline-block mx-1 px-2 py-0.5 rounded-xs text-xs font-serif font-bold bamboo-scene-tag">
                        {part}
                      </span>
                    )
                  }
                  if (part === "【旁白】") {
                    return (
                      <span key={pIdx} className="inline-block mx-1 px-2 py-0.5 rounded-xs text-xs font-serif font-bold gold-ink-narration border border-amber-700/20 dark:border-amber-500/20">
                        {part}
                      </span>
                    )
                  }
                  return (
                    <span key={pIdx} className="inline-block mx-1 px-2 py-0.5 rounded-xs text-xs font-serif font-bold badge-gold border border-primary/30">
                      {part}
                    </span>
                  )
                }
                return <span key={pIdx}>{part}</span>
              })}
            </p>
          )
        }
        return (
          <p key={index} className="text-sm sm:text-base leading-loose my-2 text-[#2c2b2a] dark:text-[#f3ede2] min-h-6">
            {displayLine}
          </p>
        )
      })}
    </div>
  )
})

/** 交付物气泡：在对话中渲染 generateAimContent 的多格式结果 */
function DeliverableBubble({
  deliverables,
  runId,
  isCurrentVersion,
  agentId,
  nextActions,
  onRepurpose,
  onQuality,
  onMarkStatus,
  onNextAction,
  isBusy,
  onEditResult,
  onCompileToWiki,
  onOpenDecision,
  onOpenPublish,
  onOpenRetro,
}: {
  deliverables: AimGenerateResponse
  runId?: string | null
  isCurrentVersion: boolean
  agentId: AimAgentId
  nextActions?: AimNextAction[]
  onRepurpose: (format: ContentFormat) => void
  onQuality: () => void
  onMarkStatus: (status: string) => void
  onNextAction?: (action: AimNextAction, content: string) => void
  isBusy: boolean
  onEditResult?: (format: ContentFormat, content: string) => void
  onCompileToWiki?: () => void
  onOpenDecision?: () => void
  onOpenPublish?: () => void
  onOpenRetro?: () => void
}) {
  const [activeTab, setActiveTab] = useState<ContentFormat>(deliverables.results[0]?.format || "raw_copy")
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)

  const activeFormat = deliverables.results.some((r) => r.format === activeTab)
    ? activeTab
    : deliverables.results[0]?.format || "raw_copy"
  const activeResult = deliverables.results.find((r) => r.format === activeFormat) || deliverables.results[0]

  async function copyText(content: string, format?: string) {
    await navigator.clipboard.writeText(content)
    if (format) {
      setCopiedFormat(format)
      setTimeout(() => setCopiedFormat(null), 600)
    }
    reportAimRunEvent(runId, "copied", format ? { format } : undefined)
    toast.success("已复制")
  }

  const hasMoments = deliverables.results.some((r) => r.format === "moments_post")
  const hasWechat = deliverables.results.some((r) => r.format === "wechat_article")
  const hasVideo = deliverables.results.some((r) => r.format === "video_script")
  const hasKoubo = deliverables.results.some((r) => r.format === "koubo_script")
  const hasPublishScript = hasVideo || hasKoubo
  const hasXiaohongshu = deliverables.results.some((r) => r.format === "xiaohongshu_post")
  const hasCommunity = deliverables.results.some((r) => r.format === "community_message")
  const hasShooting = deliverables.results.some((r) => r.format === "shooting_brief")
  const canRunPublishCheck = agentId === "content_producer" || agentId === "free_copywriter" || agentId === "deep_copywriter" || agentId === "content_review"
  const primaryNextActions = nextActions?.filter((action) => action.id === "publish_package" || action.id === "publish_check") ?? []
  const secondaryNextActions = nextActions?.filter((action) => action.id !== "publish_package" && action.id !== "publish_check") ?? []
  const hasMoreActions = Boolean(
    (!hasKoubo && hasVideo)
    || (!hasXiaohongshu && hasVideo)
    || (!hasShooting && hasVideo)
    || (!hasMoments && hasVideo)
    || (!hasCommunity && hasVideo)
    || (!hasWechat && hasVideo)
    || onCompileToWiki
    || secondaryNextActions.length > 0,
  )
  const knowledgeStrategyLabel = deliverables.knowledgeStrategy
    ? KNOWLEDGE_STRATEGY_PROFILES[deliverables.knowledgeStrategy as keyof typeof KNOWLEDGE_STRATEGY_PROFILES]?.label
      ?? deliverables.knowledgeStrategy
    : undefined
  const deliveryContract = buildAimDeliveryContract({
    conversationMode: deliverables.conversationMode,
    knowledgeCount: deliverables.knowledgeUsed?.length ?? 0,
    knowledgeTitles: deliverables.knowledgeUsed?.map((item) => item.title),
    knowledgeStrategyLabel,
    degraded: deliverables.degraded,
    qualityStatus: deliverables.qualityStatus,
    isCurrentVersion,
    primaryNextActionLabel: primaryNextActions[0]?.label,
    taskSpec: deliverables.taskSpec ?? null,
  })

  function runMoreAction(value: string | null) {
    if (!value) return
    if (value.startsWith("format:")) {
      onRepurpose(value.replace("format:", "") as ContentFormat)
      return
    }
    if (value === "compile_wiki") {
      onCompileToWiki?.()
      return
    }
    const action = secondaryNextActions.find((item) => `action:${item.id}` === value)
    if (action && activeResult) onNextAction?.(action, activeResult.content)
  }

  return (
    <div className="mt-2 w-full">
      <AiResultPanel
        title="AI 交付物"
        icon={<Sparkles className="h-4 w-4 text-primary animate-pulse" />}
        meta={
          <Badge variant={isCurrentVersion ? "secondary" : "outline"} className="text-[10px]">
            {isCurrentVersion ? "当前版本" : "历史版本"}
          </Badge>
        }
        flat
      >
        <DeliveryContractStrip contract={deliveryContract} />
        <Tabs value={activeFormat} onValueChange={(v) => setActiveTab(v as ContentFormat)} className="w-full">
          <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1 rounded-none bg-transparent p-0">
            {deliverables.results.map((item) => (
              <TabsTrigger
                key={item.format}
                value={item.format}
                className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {FORMAT_LABELS[item.format]}
              </TabsTrigger>
            ))}
          </TabsList>
          {deliverables.results.map((item) => (
            <TabsContent key={item.format} value={item.format} className="space-y-3">
              {(() => {
                const display = splitMethodNote(item.content)
                return (
                  <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{FORMAT_LABELS[item.format]} · {item.wordCount} 字</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {onEditResult && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={SOFT_ACTION_CLASS}
                      onClick={() => onEditResult(item.format, item.content)}
                    >
                      编辑
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={() => copyText(item.content, item.format)}>
                    {copiedFormat === item.format ? <Check className="h-3.5 w-3.5 mr-1" /> : <Clipboard className="h-3.5 w-3.5 mr-1" />}
                    复制
                  </Button>
                </div>
              </div>
              {display.methodNote && (
                <details className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none font-medium text-foreground/70">思考依据</summary>
                  <div className="mt-2 border-t border-border/60 pt-2">
                    <MarkdownRenderer content={display.methodNote} />
                  </div>
                </details>
              )}
              <div className="py-1">
                {item.format === "video_script" ? (
                  <ZhuJianContent text={display.result} />
                ) : (
                  <MarkdownRenderer content={display.result} />
                )}
              </div>
                  </>
                )
              })()}
            </TabsContent>
          ))}
        </Tabs>

        <ActionStrip>
          {primaryNextActions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={action.id === "publish_package" ? "default" : "ghost"}
              className={action.id === "publish_package" ? "h-7 rounded-md px-2 text-xs" : SOFT_ACTION_CLASS}
              onClick={() => {
                if (action.id === "publish_check") {
                  onQuality()
                  return
                }
                if (activeResult) onNextAction?.(action, activeResult.content)
              }}
              disabled={isBusy || !activeResult?.content.trim() || (action.id === "publish_check" && !hasPublishScript)}
            >
              {action.id === "publish_check" && <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
              {action.label}
            </Button>
          ))}
          {canRunPublishCheck && !nextActions?.some((action) => action.id === "publish_check") && (
            <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onQuality} disabled={isBusy || !hasPublishScript}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> 发布前自查
            </Button>
          )}
          <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onOpenDecision} disabled={isBusy}>
            发布前判断
          </Button>
          <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onOpenPublish} disabled={isBusy}>
            登记发布
          </Button>
          <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onOpenRetro} disabled={isBusy}>
            填写复盘
          </Button>
          <Select onValueChange={runMoreAction} disabled={isBusy || !hasMoreActions}>
            <SelectTrigger className="h-7 w-[88px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted">
              <SelectValue placeholder="更多" />
            </SelectTrigger>
            <SelectContent>
              {!hasKoubo && hasVideo && <SelectItem value="format:koubo_script">口播文案</SelectItem>}
              {!hasXiaohongshu && hasVideo && <SelectItem value="format:xiaohongshu_post">小红书图文</SelectItem>}
              {!hasShooting && hasVideo && <SelectItem value="format:shooting_brief">拍摄交接单</SelectItem>}
              {!hasMoments && hasVideo && <SelectItem value="format:moments_post">朋友圈文案</SelectItem>}
              {!hasCommunity && hasVideo && <SelectItem value="format:community_message">社群运营</SelectItem>}
              {!hasWechat && hasVideo && <SelectItem value="format:wechat_article">公众号文章</SelectItem>}
              {onCompileToWiki && <SelectItem value="compile_wiki">编译进 IP 维基</SelectItem>}
              {secondaryNextActions.map((action) => (
                <SelectItem key={action.id} value={`action:${action.id}`} disabled={!activeResult?.content.trim()}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(value) => { if (typeof value === "string") onMarkStatus(value) }}>
            <SelectTrigger className="h-7 w-[88px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_STATUS_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ActionStrip>
      </AiResultPanel>
    </div>
  )
}

function DeliveryContractStrip({ contract }: { contract: ReturnType<typeof buildAimDeliveryContract> }) {
  const toneClass = {
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-red-700 dark:text-red-400",
    neutral: "text-foreground",
  }[contract.status.tone]
  const items = [
    { label: "任务", value: contract.task.label, detail: contract.task.detail, icon: Target, className: "text-foreground" },
    { label: "依据", value: contract.evidence.label, detail: contract.evidence.detail, icon: Database, className: "text-foreground" },
    { label: "状态", value: contract.status.label, detail: contract.status.detail, icon: ShieldCheck, className: toneClass },
    { label: "下一步", value: contract.next.label, detail: contract.next.detail, icon: ArrowRight, className: "text-foreground" },
  ]

  return (
    <div className="mb-4 border-y border-border/70 bg-muted/20">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {items.map(({ label, value, detail, icon: Icon, className }, index) => (
          <div
            key={label}
            className={`min-w-0 px-3 py-2.5 ${index % 2 === 1 ? "border-l border-border/60" : ""} ${index > 1 ? "border-t border-border/60 lg:border-t-0" : ""} ${index === 2 ? "lg:border-l" : ""}`}
            title={detail}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Icon className="h-3 w-3 shrink-0" />
              <span>{label}</span>
            </div>
            <p className={`mt-1 truncate text-xs font-medium ${className}`}>{value}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      {contract.expanded && (
        <div className="border-t border-border/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {contract.taskSpec?.mode === "discovery_exploration" && (
            <p className="text-amber-600 dark:text-amber-400">
              当前信息不足，无法给出确定方案；请先补充关键资料，再生成正式方案。
            </p>
          )}
          {contract.assumptions && contract.assumptions.length > 0 && (
            <p className="mt-1">
              <span className="font-medium text-foreground">本次假设：</span>
              {contract.assumptions.map((a) => `${a.statement}（影响${a.impact}）`).join("；")}
            </p>
          )}
          {contract.unknowns && contract.unknowns.length > 0 && (
            <p className="mt-1">
              <span className="font-medium text-foreground">待确认：</span>
              {contract.unknowns.join("；")}
            </p>
          )}
          {contract.knownFacts && contract.knownFacts.length > 0 && (
            <p className="mt-1">
              <span className="font-medium text-foreground">已知事实：</span>
              {contract.knownFacts.map((f) => f.statement).join("；")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function AimPage() {
  const router = useRouter()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const agentParam = searchParams.get("agent")
  const topicTitleParam = searchParams.get("topicTitle")
  const topicRationaleParam = searchParams.get("topicRationale")
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
  const [referenceSelection, setReferenceSelection] = useState<EditorSelection>({ text: "", range: { start: 0, end: 0 } })
  const [draftSelection, setDraftSelection] = useState<EditorSelection>({ text: "", range: { start: 0, end: 0 } })
  const [isThinking, setIsThinking] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isQualityChecking, setIsQualityChecking] = useState(false)
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(() => initialDraft?.selectedProjectId || "")
  const [wikiDialog, setWikiDialog] = useState<{ open: boolean; context: IpWikiDialogContext | null }>({
    open: false,
    context: null,
  })
  const [recordDialog, setRecordDialog] = useState<RecordDialogState | null>(null)
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
  const [retroRuleForm, setRetroRuleForm] = useState<AimCalibrationRule>({
    rule: "",
    source: "内容复盘",
  })
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

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  )

  const editorPanelLabels = useMemo(
    () => getAimEditorPanelLabels(selectedAgentId, editorFormat),
    [editorFormat, selectedAgentId],
  )

  const workStage = selectedAgentId === "business_diagnosis"
    ? "灵感选题策划"
    : selectedAgentId === "persona"
      ? "人设故事梳理"
      : selectedAgentId === "content_review"
        ? "发布前质检"
        : selectedAgentId === "business_system_diagnosis"
          ? "商业模式诊断"
          : selectedAgentId === "deep_copywriter"
            ? "深度长文创作"
            : "内容文案创作"

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
        const isDeepCopy = shouldOpenDeepCopywriter(record)
        const lengthRule = buildBenchmarkLengthRule(record.transcript)
        const recreationSop = buildBenchmarkRecreationSopBlock()
        const prefill = [
          isDeepCopy ? BENCHMARK_RECREATION_PREFILL.long : BENCHMARK_RECREATION_PREFILL.short,
          "",
          "创作原则：",
          recreationSop,
          isDeepCopy
            ? "1. 先参考拆解里的开头类型和情绪入口，重新设计适合我的长文开头。"
            : "1. 开头机制可以借，但第一句话必须重写成我的身份和业务场景里的话。",
          isDeepCopy
            ? "2. 参考拆解里的正文结构、转折节奏和心理推进，但表达至少 30% 可感知重写。"
            : "2. 结构节奏可以保留，但表达至少 30% 可感知重写：案例、转折、句式和行动引导不能贴原文。",
          isDeepCopy
            ? "3. 用我的产品、案例、用户痛点和人设表达重新完成创作，除专有名词外不要连续沿用原文 12 个字以上。"
            : "3. 除专有名词外，不要连续沿用原文 12 个字以上，最终稿要像我的内容，不像原文换皮。",
          lengthRule ? `4. ${lengthRule}` : null,
          "",
          record.videoTitle ? `对标标题：${record.videoTitle}` : null,
          "对标原文：",
          record.transcript || "",
          record.analysisResult ? "\n已有拆解：" : null,
          formatAnalysisResultForPrompt(record.analysisResult),
        ].filter(Boolean).join("\n")

        startTransition(() => {
          if (isDeepCopy) setSelectedAgentId("deep_copywriter")
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

  function buildChatContent(text: string, images: AimImageAttachment[]): AimChatContent {
    if (images.length === 0) return text
    return [
      { type: "text", text: text.trim() || "请分析这张图片。" },
      ...images.map((image) => ({ type: "image_url" as const, image_url: { url: image.readUrl } })),
    ]
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

  const handleAimNextAction = useCallback(
    async (action: AimNextAction, content: string) => {
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
        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.set("agent", action.targetAgentId)
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
    },
    [agent.title, router, searchParams, selectedAgentId, selectedProjectId],
  )

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
        taskType: "write_script",
        useMarketViralVideos: selectedAgentId === "business_diagnosis",
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
        toast.success(`已标记为：${workflowStatusLabel(status)}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "状态更新失败")
      }
    },
    [messages, refreshHistory, selectedAgentId],
  )

  const openRecordDialog = useCallback((msgId: string, mode: RecordDialogMode) => {
    const base = messages.find((m) => m.id === msgId)?.deliverables
    if (!base?.id || base.id.startsWith("polish-")) {
      toast.error("只有已保存的内容才能记录")
      return
    }

    if (mode === "decision") {
      setDecisionForm({
        summary: "",
        targetUser: "",
        expectedSignal: "",
        confidence: "",
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
        toast.success("已保存复盘")
      }

      setRecordDialog(null)
      refreshHistory({ force: true, agentId: selectedAgentId })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    }
  }, [decisionForm, messages, publishForm, recordDialog, refreshHistory, retroForm, retroRuleForm, selectedAgentId])

  const busy = isThinking || isGenerating || isQualityChecking || isTranscribing
  const hasEditor = Boolean(sourceOriginalText.trim() || editorText.trim())

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-3.5rem)] min-h-115 overflow-hidden md:-mx-6 md:-my-6">
      {/* 对话区（智能体列表与最近内容已移至全局侧边栏） */}
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-card px-4 md:px-6">
        {/* 头部：AIM 业务工作台 */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {/* 小屏智能体切换 */}
            <div className="md:hidden">
              <select
                value={selectedAgentId}
                onChange={(event) => {
                  if (event.target.value !== selectedAgentId) router.push(`/aim?agent=${event.target.value}`)
                }}
                className="h-9 w-[130px] rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {AGENT_OPTIONS.map((a) => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
            <span className="hidden h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary md:flex">
              <agent.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 mr-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">AIM 工作台</span>
                <span className="text-xs text-muted-foreground">/</span>
                <p className="truncate text-sm font-semibold text-foreground">{agent.title}</p>
                <Badge variant="secondary" className="hidden h-5 rounded-md px-1.5 text-[10px] font-medium sm:inline-flex">
                  {workStage}
                </Badge>
              </div>
              <p className="mt-0.5 hidden truncate text-xs text-muted-foreground lg:block">
                {selectedProject?.name || (projectEnabled ? "未选择 IP 全案" : "未绑定项目")} · {agent.description}
              </p>
            </div>

          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={projectEnabled ? "secondary" : "outline"}
              className="hidden h-8 max-w-[220px] gap-1.5 truncate sm:inline-flex"
              onClick={() => setProjectEnabled((v) => !v)}
              title={projectEnabled ? "已启用 IP 全案上下文，点击切到纯文案模式" : "纯文案模式，点击启用 IP 全案上下文"}
            >
              {projectEnabled
                ? (projects.find((p) => p.id === selectedProjectId)?.name ?? "IP 全案")
                : "纯文案模式"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={() => void handleEvolveConversation()}
              disabled={isThinking || isGenerating || isEvolving || messages.length < 2}
              title="从当前对话提炼客户偏好 + 更新全局写作风格档案"
            >
              <Sparkles className="h-4 w-4" />
              <span className="sr-only">{isEvolving ? "提炼中" : "沉淀偏好与风格"}</span>
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => resetConversation()} title="新对话">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {projects.length === 0 && (
          <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            还没有 IP 营销全案，
            <Link href="/projects" className="text-primary underline-offset-2 hover:underline">先创建一个</Link>
            ，生成内容可自动归属。
          </div>
        )}
        {projects.length > 0 && !selectedProjectId && (
          <div className="border-b bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            正在加载你的 IP 营销全案，请稍后再生成内容。
          </div>
        )}

        {personaProgress != null && (
          <div className="border-b bg-primary/5 px-3 py-2">
            <div className="mx-auto flex max-w-2xl items-center gap-2">
              <span className="shrink-0 text-[11px] font-medium text-primary">来时路信息收集</span>
              <Progress value={personaProgress} className="h-1.5 flex-1" />
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{personaProgress}%</span>
            </div>
          </div>
        )}

        {evolutionSuggestions.length > 0 && (
          <div className="border-b bg-muted/30 px-3 py-3">
            <div className="mx-auto max-w-2xl space-y-2">
              <p className="text-xs font-medium text-muted-foreground">发现可沉淀的客户偏好</p>
              {evolutionSuggestions.map((suggestion) => (
                <div key={`${suggestion.title}-${suggestion.content}`} className="rounded-md border bg-background p-3">
                  <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{suggestion.content}</p>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setEvolutionSuggestions((prev) => prev.filter((item) => item !== suggestion))}
                    >
                      忽略
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => void handleSaveEvolutionSuggestion(suggestion)}
                    >
                      写入知识库
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 消息流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-4 sm:px-3">
          {messages.length === 0 ? (
            <div className="mx-auto flex w-full max-w-3xl flex-col py-6">
              <div className="max-w-2xl text-left">
                <p className="text-sm font-semibold text-foreground">{agent.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{agent.intro}</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-none flex-col gap-4">
              {messages.map((m) => (
                <div key={m.id} data-message-id={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`${m.deliverables ? "w-full max-w-full" : "max-w-[96%]"} ${m.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      className={`leading-relaxed ${
                        m.role === "user"
                          ? "rounded-2xl rounded-tr-sm bg-muted px-4 py-2 text-sm text-foreground"
                          : "bg-transparent p-0 text-sm sm:text-base text-foreground/90 font-medium"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        (() => {
                          const display = splitMethodNote(m.content)
                          return (
                            <>
                              {display.methodNote && (
                                <details className="mb-3 rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer select-none font-medium text-foreground/70">思考依据</summary>
                                  <div className="mt-2 border-t border-border/60 pt-2">
                                    <MarkdownRenderer content={display.methodNote} />
                                  </div>
                                </details>
                              )}
                              <MarkdownRenderer content={display.result} />
                            </>
                          )
                        })()
                      ) : (
                        <>
                          {m.images?.length ? (
                            <div className="mb-2 flex max-w-64 flex-wrap gap-2">
                              {m.images.map((image) => (
                                <img
                                  key={image.id}
                                  src={image.previewUrl}
                                  alt={image.name}
                                  className="h-20 w-20 rounded-md border object-cover"
                                />
                              ))}
                            </div>
                          ) : null}
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        </>
                      )}
                    </div>

                    {m.role === "assistant" && extractChoiceGroups(m.content).length > 0 && (
                      <ChoiceStepper
                        groups={extractChoiceGroups(m.content)}
                        busy={busy}
                        onSubmit={(text) => void sendText(text)}
                      />
                    )}

                    {m.role === "assistant" && m.failure && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 px-2 text-xs"
                        onClick={() => retryFailedMessage(m)}
                        disabled={busy}
                      >
                        <ArrowRight className="mr-1 h-3.5 w-3.5" />
                        重试本次请求
                      </Button>
                    )}

                    {m.role === "assistant" && m.editorApply?.range && extractReplacementDraft(m.content) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 px-2 text-xs"
                        onClick={() => applyEditorReplacement(m)}
                      >
                        应用到右侧选区
                      </Button>
                    )}

                    {/* 交付物气泡 */}
                    {m.deliverables && (
                      <div className="w-full mt-2">
                        <DeliverableBubble
                          deliverables={m.deliverables}
                          runId={m.runId}
                          isCurrentVersion={m.id === latestDeliverableMessageId()}
                          agentId={isValidAimAgent(m.agentId) ? m.agentId : selectedAgentId}
                          nextActions={getAimAgentGuide(isValidAimAgent(m.agentId) ? m.agentId : selectedAgentId).nextActions}
                          onRepurpose={handleRepurpose(m.id)}
                          onQuality={handleQuality(m.id)}
                          onMarkStatus={handleMarkStatus(m.id)}
                          onNextAction={handleAimNextAction}
                          isBusy={busy}
                          onEditResult={(format, content) => openEditorFromResult(m.id, format, content)}
                          onOpenDecision={() => openRecordDialog(m.id, "decision")}
                          onOpenPublish={() => openRecordDialog(m.id, "publish")}
                          onOpenRetro={() => openRecordDialog(m.id, "retro")}
                          onCompileToWiki={
                            m.agentId === "business_diagnosis" &&
                            !!selectedProjectId &&
                            !!m.deliverables.results.some((r) => r.format === "raw_copy")
                              ? () => {
                                  const text =
                                    m.deliverables!.results.find((r) => r.format === "raw_copy")?.content ?? ""
                                  setWikiDialog({
                                    open: true,
                                    context: {
                                      projectId: selectedProjectId,
                                      sourceGenerationId: m.deliverables!.id,
                                      positioningText: text,
                                    },
                                  })
                                }
                              : undefined
                          }
                        />
                      </div>
                    )}

                    {/* aim-harness-v1 执行诊断：仅在降级或质量异常时展示执行编号，不常驻 */}
                    {m.deliverables && (m.degraded || (m.qualityStatus && m.qualityStatus !== "pass")) && m.runId && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${m.degraded ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted"}`}>
                          {m.degraded ? "降级交付" : "质量提示"}
                        </span>
                        <span>执行编号 {m.runId}</span>
                        {m.qualityStatus && m.qualityStatus !== "pass" && (
                          <span>· 质量 {m.qualityStatus === "warn" ? "待优化" : m.qualityStatus === "fail" ? "未通过" : m.qualityStatus}</span>
                        )}
                      </div>
                    )}

                    {/* 质检报告 */}
                    {m.qualityReport && (
                      <div className="mt-2 w-full rounded-xl border border-primary/20 bg-card p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          质检报告
                          <Badge variant={m.qualityReport.overall.passed ? "default" : "destructive"} className="ml-auto">
                            {m.qualityReport.overall.score}分 {m.qualityReport.overall.passed ? "通过" : "需修改"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            { label: "开头吸引力", data: m.qualityReport.attraction },
                            { label: "逻辑性", data: m.qualityReport.logic },
                            { label: "去AI味", data: m.qualityReport.aiTaste },
                            { label: "文笔质量", data: m.qualityReport.editorial },
                          ].map((dim) => (
                            <div key={dim.label} className="rounded-lg border p-2 text-center">
                              <p className="text-[10px] text-muted-foreground">{dim.label}</p>
                              <p className={`text-xl font-bold ${dim.data.passed ? "text-green-600" : "text-red-500"}`}>{dim.data.score}</p>
                            </div>
                          ))}
                        </div>
                        {m.qualityReport.publishCheck && (
                          <div className="mt-4 space-y-3 border-t pt-4">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              抖音发布前自查
                              <Badge
                                variant={m.qualityReport.publishCheck.verdict === "可发" ? "default" : "destructive"}
                                className="ml-auto"
                              >
                                {m.qualityReport.publishCheck.verdict}
                              </Badge>
                            </div>
                            {m.qualityReport.publishCheck.violations.length > 0 ? (
                              <div className="space-y-2">
                                {m.qualityReport.publishCheck.violations.map((violation) => (
                                  <div key={`${violation.text}-${violation.category}`} className="rounded-lg border p-3 text-sm">
                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                      <span className="font-medium">「{violation.text}」</span>
                                      <Badge variant={violation.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">
                                        {violation.category}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{violation.reason}</p>
                                    <p className="mt-1 text-xs text-foreground">{violation.suggest}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">未发现明显发布违规风险。</p>
                            )}
                            <div className="rounded-lg border p-3">
                              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                                流量潜力评分
                                <Badge variant={m.qualityReport.publishCheck.trafficScore.score >= 80 ? "default" : "secondary"} className="ml-auto">
                                  {m.qualityReport.publishCheck.trafficScore.score}分 · {m.qualityReport.publishCheck.trafficScore.level}
                                </Badge>
                              </div>
                              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                                {m.qualityReport.publishCheck.trafficScore.reasons.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                            <p className="text-xs text-muted-foreground">{m.qualityReport.publishCheck.aiLabelReminder}</p>
                            {m.qualityReport.publishCheck.trafficWeakness.length > 0 && (
                              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                                {m.qualityReport.publishCheck.trafficWeakness.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            )}
                            {m.qualityReport.publishCheck.violations.length > 0 && m.qualityReport.publishCheck.minimalRewrite !== "" && (
                              <div className="rounded-lg bg-muted/40 p-3">
                                <p className="mb-1 text-xs font-medium text-muted-foreground">最小改法</p>
                                <p className="whitespace-pre-wrap text-sm leading-6">{m.qualityReport.publishCheck.minimalRewrite}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

            </div>
          )}
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

      <Dialog open={!!recordDialog} onOpenChange={(open) => { if (!open) setRecordDialog(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {recordDialog?.mode === "decision"
                ? "发布前判断"
                : recordDialog?.mode === "publish"
                  ? "登记发布"
                  : "填写复盘"}
            </DialogTitle>
            <DialogDescription>
              {recordDialog?.mode === "decision"
                ? "把这条为什么发、准备打到谁、想验证什么先记下来。"
                : recordDialog?.mode === "publish"
                  ? "记录发到哪个平台，顺手把状态推进到已发布。"
                  : "只写结果判断和下次同类内容的判断规则。"}
            </DialogDescription>
          </DialogHeader>

          {recordDialog?.mode === "decision" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">这条为什么值得发</p>
                <Textarea
                  value={decisionForm.summary}
                  onChange={(event) => setDecisionForm((prev) => ({ ...prev, summary: event.target.value }))}
                  placeholder="比如：这条不是讲工具，而是帮新手解决不知道从哪开始的问题。"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">最可能打中的人</p>
                <Input
                  value={decisionForm.targetUser ?? ""}
                  onChange={(event) => setDecisionForm((prev) => ({ ...prev, targetUser: event.target.value }))}
                  placeholder="比如：刚开始做 AI 内容、但没有判断标准的人。"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">发完最想验证什么</p>
                <Textarea
                  value={decisionForm.expectedSignal ?? ""}
                  onChange={(event) => setDecisionForm((prev) => ({ ...prev, expectedSignal: event.target.value }))}
                  placeholder="比如：收藏率、评论里有没有人追问工具链、是否能带出下一条选题。"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">当前把握</p>
                <Input
                  value={decisionForm.confidence ?? ""}
                  onChange={(event) => setDecisionForm((prev) => ({ ...prev, confidence: event.target.value }))}
                  placeholder="比如：7/10，题对了，但开头还不够硬。"
                />
              </div>
            </div>
          )}

          {recordDialog?.mode === "publish" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">发布平台</p>
                <Input
                  value={publishForm.publishPlatform}
                  onChange={(event) => setPublishForm((prev) => ({ ...prev, publishPlatform: event.target.value }))}
                  placeholder="抖音 / 小红书 / 视频号"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">内容链接</p>
                <Input
                  value={publishForm.publishUrl}
                  onChange={(event) => setPublishForm((prev) => ({ ...prev, publishUrl: event.target.value }))}
                  placeholder="粘贴发布后的链接，没有可先留空。"
                />
              </div>
            </div>
          )}

          {recordDialog?.mode === "retro" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">这次结果怎么判断</p>
                <Textarea
                  value={retroForm.summary}
                  onChange={(event) => setRetroForm((prev) => ({ ...prev, summary: event.target.value }))}
                  placeholder="比如：播放一般，但收藏和私信明显高，说明题不破圈，但很能打中目标人。"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">实际数据或反馈</p>
                <Textarea
                  value={retroForm.actualData ?? ""}
                  onChange={(event) => setRetroForm((prev) => ({ ...prev, actualData: event.target.value }))}
                  placeholder="写播放、点赞、收藏、评论、私信，或者用户原话。"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">这次判断哪里对，哪里错</p>
                <Textarea
                  value={retroForm.verdict ?? ""}
                  onChange={(event) => setRetroForm((prev) => ({ ...prev, verdict: event.target.value }))}
                  placeholder="比如：判断对在痛点，判断错在标题太像教程合集。"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">下次同类内容怎么判断</p>
                <Textarea
                  value={retroRuleForm.rule}
                  onChange={(event) => setRetroRuleForm((prev) => ({ ...prev, rule: event.target.value }))}
                  placeholder="比如：工具类长教程先看能不能压成一个明确场景，否则不做大而全。"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialog(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSubmitRecordDialog()} disabled={busy}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

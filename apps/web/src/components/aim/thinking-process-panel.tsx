"use client"

import { useEffect, useState, useRef, memo } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Search,
  Sparkles,
  AlertTriangle,
  SkipForward,
  Brain,
  FileSearch,
  Target,
  ShieldCheck,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── 类型定义 ──────────────────────────────────────────────────────────────

export interface TraceStep {
  key: string
  label: string
  status: "running" | "success" | "failed" | "skipped"
  durationMs?: number
  summary?: string
  inputSummary?: string
  outputSummary?: string
  metadata?: Record<string, unknown>
  error?: string
}

export interface ThinkingProcessPanelProps {
  traceId: string | null
  /** "chat" 对应对话模式, "generate" 对应生成模式 */
  type: "chat" | "generate"
  /** 整个 trace 完成时的回调（成功或失败） */
  onComplete?: () => void
}

// ── 步骤分类与图标映射 ─────────────────────────────────────────────────────

type StepPhase = "understand" | "retrieve" | "plan" | "generate" | "quality" | "other"

interface StepMeta {
  phase: StepPhase
  phaseLabel: string
  icon: typeof Brain
}

const CHAT_STEP_META: Record<string, StepMeta> = {
  route_request: { phase: "understand", phaseLabel: "理解阶段", icon: Target },
  conversation_intent: { phase: "understand", phaseLabel: "理解阶段", icon: Brain },
  knowledge_context: { phase: "retrieve", phaseLabel: "检索阶段", icon: Search },
  style_profile: { phase: "retrieve", phaseLabel: "检索阶段", icon: FileSearch },
  competitor_context: { phase: "retrieve", phaseLabel: "检索阶段", icon: Search },
  editor_context: { phase: "retrieve", phaseLabel: "检索阶段", icon: FileSearch },
  aim_memory: { phase: "retrieve", phaseLabel: "检索阶段", icon: Search },
  context_summary: { phase: "plan", phaseLabel: "规划阶段", icon: Brain },
  llm_stream_chat: { phase: "generate", phaseLabel: "生成阶段", icon: Sparkles },
}

const GENERATE_STEP_META: Record<string, StepMeta> = {
  parse_request: { phase: "understand", phaseLabel: "需求分析", icon: Target },
  validate_input: { phase: "understand", phaseLabel: "需求分析", icon: FileSearch },
  resolve_runtime_task: { phase: "understand", phaseLabel: "需求分析", icon: Brain },
  video_copy_context: { phase: "retrieve", phaseLabel: "素材收集", icon: Search },
  market_viral_context: { phase: "retrieve", phaseLabel: "素材收集", icon: Search },
  trending_context: { phase: "retrieve", phaseLabel: "素材收集", icon: Search },
  comment_insight_context: { phase: "retrieve", phaseLabel: "素材收集", icon: Search },
  quality_gate: { phase: "quality", phaseLabel: "质检优化", icon: ShieldCheck },
}

function getStepMeta(key: string, type: "chat" | "generate"): StepMeta {
  const metaMap = type === "generate" ? GENERATE_STEP_META : CHAT_STEP_META
  return metaMap[key] ?? { phase: "other", phaseLabel: "其他", icon: Zap }
}

// ── 阶段标签（仅 generate 模式使用） ───────────────────────────────────────

const GENERATE_PHASE_LABELS: Record<StepPhase, { label: string; icon: typeof Brain }> = {
  understand: { label: "需求分析", icon: Target },
  retrieve: { label: "素材收集", icon: Search },
  plan: { label: "内容规划", icon: Brain },
  generate: { label: "内容生成", icon: Sparkles },
  quality: { label: "质检优化", icon: ShieldCheck },
  other: { label: "其他", icon: Zap },
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

function formatDuration(ms?: number): string {
  if (ms == null) return ""
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function extractPhaseSummary(step: TraceStep): string {
  if (step.summary) return step.summary
  if (step.outputSummary) return step.outputSummary
  const meta = step.metadata
  if (!meta) return ""
  if (typeof meta.entries === "number") return `命中 ${meta.entries} 条知识`
  if (typeof meta.count === "number") return `${meta.count} 条`
  if (typeof meta.chars === "number") return `${meta.chars} 字`
  if (typeof meta.knowledgeEntries === "number") return `命中 ${meta.knowledgeEntries} 条知识`
  return ""
}

// ── 子组件 ────────────────────────────────────────────────────────────────

/** 单个步骤的状态图标 */
function StepStatusIcon({ status }: { status: TraceStep["status"] }) {
  switch (status) {
    case "success":
      return <Check className="h-3 w-3 text-emerald-500" />
    case "failed":
      return <AlertTriangle className="h-3 w-3 text-red-500" />
    case "skipped":
      return <SkipForward className="h-3 w-3 text-muted-foreground/40" />
    case "running":
    default:
      return <Loader2 className="h-3 w-3 animate-spin text-primary" />
  }
}

/** 单个可折叠步骤 */
const TraceStepItem = memo(function TraceStepItem({
  step,
  defaultExpanded,
}: {
  step: TraceStep
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const meta = step.metadata ?? {}

  return (
    <div className="group flex gap-2.5">
      {/* 左侧：时间线节点 */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            step.status === "success" && "border-emerald-500/40 bg-emerald-500/10",
            step.status === "failed" && "border-red-500/40 bg-red-500/10",
            step.status === "skipped" && "border-muted-foreground/20 bg-muted/30",
            step.status === "running" && "border-primary/40 bg-primary/10",
          )}
        >
          <StepStatusIcon status={step.status} />
        </div>
      </div>

      {/* 右侧：步骤内容 */}
      <div className="min-w-0 flex-1 pb-2">
        {/* 折叠头部 */}
        <button
          type="button"
          className="flex w-full items-center gap-1.5 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          )}
          <span
            className={cn(
              "text-xs font-medium",
              step.status === "success" && "text-foreground/80",
              step.status === "failed" && "text-red-600 dark:text-red-400",
              step.status === "skipped" && "text-muted-foreground/40 line-through",
              step.status === "running" && "text-primary",
            )}
          >
            {step.label}
          </span>
          {step.durationMs != null && step.status !== "running" && (
            <span className="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums">
              {formatDuration(step.durationMs)}
            </span>
          )}
          {!expanded && step.status === "success" && extractPhaseSummary(step) && (
            <span className="min-w-0 truncate text-[10px] text-muted-foreground/50">
              · {extractPhaseSummary(step)}
            </span>
          )}
        </button>

        {/* 展开详情 */}
        {expanded && (
          <div className="mt-1 ml-4.5 space-y-1 border-l border-border/30 pl-3">
            {step.summary && (
              <p className="text-[11px] leading-4 text-muted-foreground/70">{step.summary}</p>
            )}
            {step.error && (
              <p className="text-[11px] leading-4 text-red-500/80">{step.error}</p>
            )}
            {/* metadata 关键字段展示 */}
            {Object.entries(meta).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(meta)
                  .filter(([, v]) => v != null && typeof v !== "object")
                  .map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/60"
                    >
                      {k}: {String(v)}
                    </span>
                  ))}
              </div>
            )}
            {step.outputSummary && !step.summary && (
              <p className="text-[10px] leading-4 text-muted-foreground/50 italic">
                {step.outputSummary.slice(0, 200)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

// ── 主组件 ────────────────────────────────────────────────────────────────

/**
 * 思考过程面板：通过 SSE 实时展示 AIM 智能体的处理步骤。
 *
 * 当 traceId 不为空时，组件会自动连接 SSE 端点接收步骤事件。
 * 所有步骤完成后自动折叠为摘要条，用户可重新展开查看详情。
 */
export function ThinkingProcessPanel({
  traceId,
  type,
  onComplete,
}: ThinkingProcessPanelProps) {
  const [steps, setSteps] = useState<TraceStep[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [isFailed, setIsFailed] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // 连接 SSE
  useEffect(() => {
    if (!traceId) return

    let cancelled = false
    const es = new EventSource(
      `/api/aim/trace/${encodeURIComponent(traceId)}`,
      { withCredentials: true },
    )
    eventSourceRef.current = es

    es.onopen = () => {
      if (!cancelled) setConnected(true)
    }

    es.onmessage = (event) => {
      if (cancelled) return
      try {
        const data = JSON.parse(event.data as string)

        switch (data.type) {
          case "connected":
            // SSE 连接成功
            break
          case "step":
            setSteps((prev) => {
              // 按步骤 key 去重更新（同一步骤可能被多次推送用于状态更新）
              const idx = prev.findIndex((s) => s.key === data.step?.key)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = data.step as TraceStep
                return next
              }
              return [...prev, data.step as TraceStep]
            })
            break
          case "done":
            setIsComplete(true)
            setIsFailed(data.status === "failed")
            onCompleteRef.current?.()
            es.close()
            eventSourceRef.current = null
            break
          case "error":
            setIsComplete(true)
            setIsFailed(true)
            es.close()
            eventSourceRef.current = null
            break
          case "timeout":
            setIsComplete(true)
            es.close()
            eventSourceRef.current = null
            break
        }
      } catch {
        // 忽略解析错误
      }
    }

    es.onerror = () => {
      if (!cancelled) {
        setIsComplete(true)
      }
      es.close()
      eventSourceRef.current = null
    }

    return () => {
      cancelled = true
      es.close()
      eventSourceRef.current = null
      setConnected(false)
    }
  }, [traceId])

  // 完成后 3 秒自动折叠面板
  useEffect(() => {
    if (!isComplete || !panelExpanded) return
    const timer = setTimeout(() => {
      setPanelExpanded(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [isComplete, panelExpanded])

  // 无 traceId 时不渲染
  if (!traceId) return null
  // 没有步骤且已完成且未连接时不渲染（已完成且折叠）
  if (isComplete && steps.length === 0 && !connected) return null

  const successCount = steps.filter((s) => s.status === "success").length
  const failedCount = steps.filter((s) => s.status === "failed").length
  const totalDuration = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0)

  // ── 折叠态（摘要条） ──
  if (isComplete && !panelExpanded) {
    return (
      <button
        type="button"
        onClick={() => setPanelExpanded(true)}
        className="group flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-1.5 text-left transition-colors hover:bg-muted/25"
      >
        <Clock className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground/60">
          思考过程
        </span>
        <span className="text-[10px] text-muted-foreground/40 tabular-nums">
          {successCount} 步完成
          {failedCount > 0 && ` · ${failedCount} 步失败`}
          {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
        </span>
        <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground/40 transition-transform group-hover:text-muted-foreground/60" />
      </button>
    )
  }

  // ── 展开态（完整时间线） ──
  const metaMap = type === "generate" ? GENERATE_STEP_META : CHAT_STEP_META

  // 按阶段分组（仅 generate 模式）
  const phaseGroups = type === "generate"
    ? (() => {
        const groups: { phase: StepPhase; steps: TraceStep[] }[] = []
        const phaseOrder: StepPhase[] = ["understand", "retrieve", "plan", "generate", "quality", "other"]
        for (const phase of phaseOrder) {
          const phaseSteps = steps.filter((s) => getStepMeta(s.key, "generate").phase === phase)
          if (phaseSteps.length > 0) {
            groups.push({ phase, steps: phaseSteps })
          }
        }
        return groups
      })()
    : null

  return (
    <div
      className={cn(
        "w-full rounded-lg border transition-all duration-200",
        isComplete
          ? isFailed
            ? "border-red-500/20 bg-red-500/[0.03]"
            : "border-border/50 bg-muted/10"
          : "border-primary/20 bg-primary/[0.03]",
      )}
    >
      {/* 头部 */}
      <button
        type="button"
        onClick={() => isComplete && setPanelExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {isComplete ? (
          isFailed ? (
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          )
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        )}
        <span className="text-xs font-medium text-foreground/70">
          {isComplete ? "思考过程" : "正在思考…"}
        </span>
        {totalDuration > 0 && isComplete && (
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">
            共 {formatDuration(totalDuration)}
          </span>
        )}
        {isComplete && (
          <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground/40" />
        )}
      </button>

      {/* 步骤列表 */}
      {(panelExpanded || !isComplete) && (
        <div className="border-t border-border/30 px-3 py-2.5">
          {/* Generate 模式：按阶段分组展示 */}
          {phaseGroups ? (
            <div className="space-y-3">
              {phaseGroups.map((group) => {
                const phaseInfo = GENERATE_PHASE_LABELS[group.phase]
                const PhaseIcon = phaseInfo.icon
                return (
                  <div key={group.phase}>
                    {/* 阶段标签 */}
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <PhaseIcon className="h-3 w-3 text-primary/60" />
                      <span className="text-[11px] font-semibold text-primary/70">
                        {phaseInfo.label}
                      </span>
                      <div className="h-px flex-1 bg-border/20" />
                    </div>
                    {/* 阶段内步骤 */}
                    <div className="ml-1">
                      {group.steps.map((step) => (
                        <TraceStepItem
                          key={step.key}
                          step={step}
                          defaultExpanded={step.status === "failed"}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Chat 模式：直接列出所有步骤 */
            <div>
              {steps.map((step) => (
                <TraceStepItem
                  key={step.key}
                  step={step}
                  defaultExpanded={step.status === "failed"}
                />
              ))}
            </div>
          )}

          {/* 无步骤时的占位 */}
          {steps.length === 0 && !isComplete && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
              <Loader2 className="h-3 w-3 animate-spin" />
              正在分析请求…
            </div>
          )}
        </div>
      )}
    </div>
  )
}

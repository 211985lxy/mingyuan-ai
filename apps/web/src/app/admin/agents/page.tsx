"use client"

import React from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clipboard,
  Clock3,
  Gauge,
  Layers3,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

// 安全读取 admin token（损坏/缺失的 localStorage 不应导致页面崩溃）。
// 与 admin/methodology/page.tsx 的 getAdminToken 约定保持一致。
function getAdminToken(): string {
  if (typeof window === "undefined") return ""
  try {
    const authStr = localStorage.getItem("mingyuan-admin-auth")
    if (!authStr) return ""
    return JSON.parse(authStr).state?.token || ""
  } catch {
    return ""
  }
}

type TraceStatus = "running" | "success" | "failed" | "skipped"

interface TraceStep {
  key: string
  label: string
  status: TraceStatus
  durationMs?: number
  summary?: string
  inputSummary?: string
  outputSummary?: string
  error?: string
  metadata?: Record<string, unknown>
  startedAt?: string
}

interface TraceSummary {
  id: string
  agentId: string | null
  action: string
  status: TraceStatus
  durationMs: number | null
  model: string | null
  totalTokens: number | null
  inputSummary: string | null
  outputSummary: string | null
  errorMessage: string | null
  createdAt: string
}

interface TraceDetail extends TraceSummary {
  steps: TraceStep[]
}

interface TraceStats {
  total24h: number
  failed24h: number
  success24h: number
  successRate24h: number
  averageDurationMs24h: number
  copied24h: number
  revised24h: number
  accepted24h: number
}

const workflow = [
  { label: "解析任务", desc: "识别用户意图、智能体、格式和约束", icon: Search },
  { label: "选择上下文", desc: "召回知识库、风格档案、IP Wiki、竞品证据", icon: Layers3 },
  { label: "调用执行", desc: "进入对应智能体和模型生成", icon: Bot },
  { label: "验证返回", desc: "解析格式、记录模型和 token", icon: CheckCircle2 },
  { label: "失败回退", desc: "记录失败点，保留错误摘要", icon: ShieldCheck },
  { label: "结果汇总", desc: "保存输出摘要和执行耗时", icon: Sparkles },
]

export default function AdminAgentsPage() {
  const [traces, setTraces] = React.useState<TraceSummary[]>([])
  const [selected, setSelected] = React.useState<TraceDetail | null>(null)
  const [stats, setStats] = React.useState<TraceStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const selectedIdRef = React.useRef<string | null>(null)

  const loadDetail = React.useCallback(async (id: string) => {
    const authToken = getAdminToken()
    const res = await fetch(`/api/admin/agents/traces/${id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (!res.ok) return
    const payload = await res.json()
    selectedIdRef.current = id
    setSelected(payload.data)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    async function loadList() {
      const authToken = getAdminToken()
      const res = await fetch("/api/admin/agents/traces?limit=30", {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!res.ok) throw new Error("加载 trace 失败")
      const payload = await res.json()
      if (cancelled) return
      const traces = payload?.data?.traces ?? []
      setTraces(traces)
      setStats(payload?.data?.stats ?? null)
      setLoading(false)
      if (!selectedIdRef.current && traces[0]) {
        void loadDetail(traces[0].id)
      }
    }
    const first = window.setTimeout(() => {
      void loadList().catch(() => setLoading(false))
    }, 0)
    const id = window.setInterval(() => {
      void loadList().catch(() => null)
    }, 2000)
    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [loadDetail])

  return (
    <div className="min-h-[calc(100vh-7rem)] rounded-xl border border-slate-800 bg-[#080a12] p-4 text-slate-100 shadow-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-blue-300" />
          <div>
            <h1 className="text-lg font-semibold">智能体执行观测台</h1>
            <p className="text-xs text-slate-400">每一步可观测 · Trace · Context · Model · Quality</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">每 2 秒自动刷新</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CheckCircle2} label="24h 成功率" value={`${stats?.successRate24h ?? 0}%`} />
        <MetricCard icon={Gauge} label="平均耗时" value={`${Math.round((stats?.averageDurationMs24h ?? 0) / 1000)}s`} />
        <MetricCard icon={AlertTriangle} label="失败数" value={String(stats?.failed24h ?? 0)} />
        <MetricCard icon={Clock3} label="今日请求" value={String(stats?.total24h ?? 0)} />
        <MetricCard icon={Clipboard} label="复制次数" value={String(stats?.copied24h ?? 0)} />
        <MetricCard icon={Sparkles} label="采纳次数" value={String(stats?.accepted24h ?? 0)} />
        <MetricCard icon={Layers3} label="追改次数" value={String(stats?.revised24h ?? 0)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <main className="rounded-xl border border-white/10 bg-slate-950/80 p-4">
          <section className="rounded-lg border border-blue-400/20 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,.25),transparent_28%),linear-gradient(135deg,#10183f,#071126_62%,#0b1230)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-200">A Six-Step Discipline</p>
            <h2 className="mt-2 text-2xl font-bold">让工具调用从“能跑”到“稳跑”</h2>
            <div className="mt-7 grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
              {workflow.map((item, index) => (
                <WorkflowCard key={item.label} index={index + 1} {...item} />
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">当前执行详情</h3>
              {selected ? <StatusBadge status={selected.status} /> : null}
            </div>
            {selected ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-300">
                  <p className="font-medium text-slate-100">{selected.agentId || "unknown"} · {selected.action}</p>
                  <p className="mt-2 text-xs text-slate-500">输入：{selected.inputSummary || "无摘要"}</p>
                  {selected.outputSummary ? <p className="mt-1 text-xs text-slate-500">输出：{selected.outputSummary}</p> : null}
                  {selected.errorMessage ? <p className="mt-1 text-xs text-red-300">错误：{selected.errorMessage}</p> : null}
                </div>
                <div className="space-y-2">
                  {selected.steps?.length ? selected.steps.map((step) => <StepRow key={`${step.key}-${step.startedAt || step.label}`} step={step} />) : (
                    <p className="rounded-lg border border-white/10 p-4 text-sm text-slate-500">暂无步骤记录</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-white/10 p-4 text-sm text-slate-500">{loading ? "加载中..." : "暂无执行记录"}</p>
            )}
          </section>
        </main>

        <aside className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-blue-300" />
            最近执行
          </h3>
          <div className="max-h-[720px] space-y-2 overflow-auto pr-1">
            {traces.map((trace) => (
              <button
                key={trace.id}
                onClick={() => loadDetail(trace.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selected?.id === trace.id ? "border-blue-400 bg-blue-500/10" : "border-white/10 bg-slate-950/70 hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{trace.agentId || "unknown"} · {trace.action}</p>
                  <StatusBadge status={trace.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-slate-500">{trace.inputSummary || "无输入摘要"}</p>
                <p className="mt-2 text-[11px] text-slate-600">{formatDuration(trace.durationMs)} · {new Date(trace.createdAt).toLocaleString("zh-CN")}</p>
              </button>
            ))}
            {!traces.length ? <p className="rounded-lg border border-white/10 p-4 text-sm text-slate-500">{loading ? "加载中..." : "暂无执行记录"}</p> : null}
          </div>
        </aside>
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <Icon className="mb-3 h-5 w-5 text-blue-300" />
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function WorkflowCard({ icon: Icon, index, label, desc }: { icon: LucideIcon; index: number; label: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
      <div className="mb-4 flex items-center justify-between">
        <Icon className="h-5 w-5 text-blue-300" />
        <span className="rounded-full border border-blue-300/30 px-2 py-0.5 text-xs text-blue-200">{String(index).padStart(2, "0")}</span>
      </div>
      <h3 className="font-semibold">{label}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-400">{desc}</p>
    </div>
  )
}

function StepRow({ step }: { step: TraceStep }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {step.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-blue-300" /> : null}
          <p className="text-sm font-medium">{step.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={step.status} />
          <span className="text-xs text-slate-500">{formatDuration(step.durationMs ?? null)}</span>
        </div>
      </div>
      {step.summary ? <p className="mt-2 text-xs text-slate-400">{step.summary}</p> : null}
      {step.inputSummary ? <p className="mt-1 text-xs text-slate-600">输入：{step.inputSummary}</p> : null}
      {step.outputSummary ? <p className="mt-1 text-xs text-slate-600">输出：{step.outputSummary}</p> : null}
      {step.error ? <p className="mt-1 text-xs text-red-300">错误：{step.error}</p> : null}
    </div>
  )
}

function StatusBadge({ status }: { status: TraceStatus }) {
  const className = {
    running: "border-blue-300/30 bg-blue-500/10 text-blue-200",
    success: "border-emerald-300/30 bg-emerald-500/10 text-emerald-200",
    failed: "border-red-300/30 bg-red-500/10 text-red-200",
    skipped: "border-slate-300/20 bg-slate-500/10 text-slate-300",
  }[status]
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${className}`}>{status}</span>
}

function formatDuration(value: number | null) {
  if (!value) return "--"
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`
}

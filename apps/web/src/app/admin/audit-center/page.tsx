"use client"

import React from "react"
import { useSearchParams } from "next/navigation"
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ExternalLink,
  GitBranch,
  RefreshCw,
  Server,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type AuditSource = "user" | "admin" | "aim" | "agent_api" | "repo_agent" | "server"
type AuditCategory = "operation" | "execution" | "model_call" | "repository_change" | "deployment" | "runtime"
type AuditSeverity = "info" | "warning" | "error" | "critical"
type AuditStatus = "started" | "success" | "failed"

interface AuditEvent {
  id: string
  occurredAt: string
  source: AuditSource
  category: AuditCategory
  severity: AuditSeverity
  status: AuditStatus
  action: string
  summary: string
  actorType: string | null
  actorIdHash: string | null
  targetType: string | null
  targetId: string | null
  projectId: string | null
  environment: string | null
  correlationId: string | null
  requestId: string | null
  traceId: string | null
  gitSha: string | null
  sourceRecordType: string | null
  sourceRecordId: string | null
  idempotencyKey: string
  payloadHash?: string | null
  metadata: unknown
  externalLogUrl: string | null
}

interface AuditEventDetail {
  event: AuditEvent
  related: AuditEvent[]
}

const sourceOptions: Array<{ value: "" | AuditSource; label: string }> = [
  { value: "", label: "全部来源" },
  { value: "user", label: "用户" },
  { value: "admin", label: "管理员" },
  { value: "aim", label: "AIM 执行" },
  { value: "agent_api", label: "智能体 API" },
  { value: "repo_agent", label: "代码智能体" },
  { value: "server", label: "服务器" },
]

const categoryOptions: Array<{ value: "" | AuditCategory; label: string }> = [
  { value: "", label: "全部类别" },
  { value: "operation", label: "操作" },
  { value: "execution", label: "执行" },
  { value: "model_call", label: "模型调用" },
  { value: "repository_change", label: "仓库变更" },
  { value: "deployment", label: "部署" },
  { value: "runtime", label: "运行时" },
]

const severityOptions: Array<{ value: "" | AuditSeverity; label: string }> = [
  { value: "", label: "全部级别" },
  { value: "info", label: "信息" },
  { value: "warning", label: "警告" },
  { value: "error", label: "错误" },
  { value: "critical", label: "严重" },
]

const statusOptions: Array<{ value: "" | AuditStatus; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "started", label: "进行中" },
  { value: "success", label: "成功" },
  { value: "failed", label: "失败" },
]

const sourceLabels = Object.fromEntries(sourceOptions.filter((item) => item.value).map((item) => [item.value, item.label])) as Record<AuditSource, string>
const categoryLabels = Object.fromEntries(categoryOptions.filter((item) => item.value).map((item) => [item.value, item.label])) as Record<AuditCategory, string>
const severityLabels: Record<AuditSeverity, string> = { info: "信息", warning: "警告", error: "错误", critical: "严重" }
const statusLabels: Record<AuditStatus, string> = { started: "进行中", success: "成功", failed: "失败" }

function shanghaiDateInput(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value))
}

function shortId(value: string | null | undefined, length = 12) {
  if (!value) return "—"
  return value.length > length ? `${value.slice(0, length)}…` : value
}

function severityVariant(severity: AuditSeverity): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "critical" || severity === "error") return "destructive"
  if (severity === "warning") return "secondary"
  return "outline"
}

function statusVariant(status: AuditStatus): "default" | "secondary" | "destructive" {
  if (status === "failed") return "destructive"
  if (status === "started") return "secondary"
  return "default"
}

function sourceIcon(source: AuditSource) {
  if (source === "server") return Server
  if (source === "repo_agent") return GitBranch
  if (source === "aim" || source === "agent_api") return Bot
  if (source === "admin") return ShieldCheck
  return UserRound
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function AuditCenterPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const [date, setDate] = React.useState(searchParams.get("date") || shanghaiDateInput())
  const [toDate, setToDate] = React.useState(searchParams.get("to") || searchParams.get("date") || shanghaiDateInput())
  const [source, setSource] = React.useState(searchParams.get("source") || "")
  const [category, setCategory] = React.useState(searchParams.get("category") || "")
  const [severity, setSeverity] = React.useState(searchParams.get("severity") || "")
  const [status, setStatus] = React.useState(searchParams.get("status") || "")
  const [action, setAction] = React.useState("")
  const [correlationId, setCorrelationId] = React.useState("")
  const [events, setEvents] = React.useState<AuditEvent[]>([])
  const [total, setTotal] = React.useState(0)
  const [summary, setSummary] = React.useState<{ failed: number | null; critical: number | null; sourceCount: number | null }>({ failed: null, critical: null, sourceCount: null })
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<AuditEventDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const requestSerial = React.useRef(0)

  const query = React.useMemo(() => ({ from: date, to: toDate, source, category, severity, status, action, correlationId }), [date, toDate, source, category, severity, status, action, correlationId])

  const loadEvents = React.useCallback(async (cursor?: string, append = false) => {
    const serial = ++requestSerial.current
    if (!append) {
      setLoading(true)
      setError(null)
      setSelectedId(null)
      setDetail(null)
    }
    const params = new URLSearchParams({ from: query.from, to: query.to, limit: "50" })
    for (const [key, value] of Object.entries(query)) {
      if (key !== "from" && key !== "to" && value) params.set(key, value)
    }
    if (cursor) params.set("cursor", cursor)
    try {
      const summaryParams = new URLSearchParams(params)
      summaryParams.delete("limit")
      summaryParams.delete("cursor")
      const [response, summaryResponse] = await Promise.all([
        fetch(`/api/admin/audit-events?${params.toString()}`),
        fetch(`/api/admin/audit-events/summary?${summaryParams.toString()}`),
      ])
      if (!response.ok) throw new Error(`审计事件加载失败 (${response.status})`)
      const payload = await response.json() as { data?: AuditEvent[]; total?: number; nextCursor?: string | null }
      const summaryPayload = summaryResponse.ok
        ? await summaryResponse.json() as { failed?: number; critical?: number; sourceCount?: number }
        : null
      if (serial !== requestSerial.current) return
      const rows = Array.isArray(payload.data) ? payload.data : []
      setEvents((previous) => append ? [...previous, ...rows] : rows)
      setTotal(typeof payload.total === "number" ? payload.total : rows.length)
      setNextCursor(payload.nextCursor || null)
      setSummary({
        failed: typeof summaryPayload?.failed === "number" ? summaryPayload.failed : null,
        critical: typeof summaryPayload?.critical === "number" ? summaryPayload.critical : null,
        sourceCount: typeof summaryPayload?.sourceCount === "number" ? summaryPayload.sourceCount : null,
      })
    } catch (reason) {
      if (serial !== requestSerial.current) return
      const message = reason instanceof Error ? reason.message : "审计事件加载失败"
      setError(message)
      setEvents([])
      setTotal(0)
      setNextCursor(null)
      setSummary({ failed: null, critical: null, sourceCount: null })
      toast.error(message)
    } finally {
      if (serial === requestSerial.current) setLoading(false)
    }
  }, [query])

  React.useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const loadDetail = React.useCallback(async (id: string) => {
    setSelectedId(id)
    setDetailLoading(true)
    try {
      const response = await fetch(`/api/admin/audit-events/${encodeURIComponent(id)}`)
      if (!response.ok) throw new Error(`审计事件详情加载失败 (${response.status})`)
      const payload = await response.json() as { data?: AuditEventDetail }
      setDetail(payload.data || null)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "审计事件详情加载失败"
      toast.error(message)
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  return (
    <AdminPageShell
      title="统一审计中心"
      subtitle="把管理员、用户、AIM、代码智能体和服务器事件放在同一条可追溯链路里。"
      actions={
        <Button variant="outline" size="sm" onClick={() => void loadEvents()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      }
      stats={
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="筛选结果" value={total} icon={Activity} />
          <StatCard label="失败事件" value={summary.failed} icon={AlertTriangle} tone="warning" />
          <StatCard label="严重事件" value={summary.critical} icon={CircleDot} tone="danger" />
          <StatCard label="事件来源" value={summary.sourceCount} icon={GitBranch} />
        </div>
      }
      filter={
        <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">事件日期</span>
            <Input aria-label="事件日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-[148px]" />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">结束日期</span>
            <Input aria-label="结束日期" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="w-[148px]" />
          </label>
          <SelectFilter label="事件来源" value={source} options={sourceOptions} onChange={setSource} />
          <SelectFilter label="事件类别" value={category} options={categoryOptions} onChange={setCategory} />
          <SelectFilter label="严重级别" value={severity} options={severityOptions} onChange={setSeverity} />
          <SelectFilter label="事件状态" value={status} options={statusOptions} onChange={setStatus} />
          <Input aria-label="操作筛选" placeholder="筛选操作" value={action} onChange={(event) => setAction(event.target.value)} className="w-full sm:w-36" />
          <Input aria-label="关联 ID 筛选" placeholder="关联 ID" value={correlationId} onChange={(event) => setCorrelationId(event.target.value)} className="w-full sm:w-44" />
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => void loadEvents()}
      empty={!loading && !error && events.length === 0}
      emptyMessage="当前筛选条件下暂无审计事件"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between border-b">
            <CardTitle>事件时间线</CardTitle>
            <span className="text-xs text-muted-foreground">已加载 {events.length} / {total}</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {events.map((event) => {
                const Icon = sourceIcon(event.source)
                const selected = selectedId === event.id
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => void loadDetail(event.id)}
                    className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none ${selected ? "bg-muted/50" : ""}`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[11px]">{sourceLabels[event.source]}</Badge>
                        <Badge variant={statusVariant(event.status)} className="text-[11px]">{statusLabels[event.status]}</Badge>
                        <Badge variant={severityVariant(event.severity)} className="text-[11px]">{severityLabels[event.severity]}</Badge>
                        <span className="text-xs text-muted-foreground">{categoryLabels[event.category]}</span>
                      </span>
                      <span className="mt-1 block truncate font-medium">{event.summary || event.action}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{event.action} · {event.targetType || "系统"}{event.targetId ? `/${shortId(event.targetId)}` : ""}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{formatDateTime(event.occurredAt)} · 关联 {shortId(event.correlationId)}</span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
            {nextCursor && (
              <div className="border-t p-3 text-center">
                <Button variant="outline" size="sm" onClick={() => void loadEvents(nextCursor, true)} disabled={loading}>
                  加载更多
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <AuditDetailPanel detail={detail} loading={detailLoading} />
      </div>
    </AdminPageShell>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string
  value: number | null
  icon: React.ComponentType<{ className?: string }>
  tone?: "default" | "warning" | "danger"
}) {
  const color = tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "text-primary"
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${color}`} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{value === null ? "—" : value.toLocaleString("zh-CN")}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function AuditDetailPanel({ detail, loading }: { detail: AuditEventDetail | null; loading: boolean }) {
  if (loading) {
    return <Card><CardContent className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">正在加载事件详情…</CardContent></Card>
  }
  if (!detail) {
    return <Card><CardContent className="flex min-h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><ShieldCheck className="h-8 w-8" /><p>选择一条事件查看详情和关联链路</p></CardContent></Card>
  }
  const { event, related } = detail
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <CardTitle>事件详情</CardTitle>
        <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-base font-medium">{event.summary || event.action}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">{sourceLabels[event.source]}</Badge>
            <Badge variant={statusVariant(event.status)}>{statusLabels[event.status]}</Badge>
            <Badge variant={severityVariant(event.severity)}>{severityLabels[event.severity]}</Badge>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          <DetailRow label="操作" value={event.action} />
          <DetailRow label="对象" value={`${event.targetType || "系统"}${event.targetId ? ` / ${event.targetId}` : ""}`} />
          <DetailRow label="操作者" value={event.actorIdHash ? `${event.actorType || "未知"} · ${event.actorIdHash}` : event.actorType || "—"} />
          <DetailRow label="项目" value={event.projectId || "—"} />
          <DetailRow label="环境" value={event.environment || "—"} />
          <DetailRow label="请求 ID" value={event.requestId || "—"} mono />
          <DetailRow label="追踪 ID" value={event.traceId || "—"} mono />
          <DetailRow label="提交" value={event.gitSha ? shortId(event.gitSha, 14) : "—"} mono />
          <DetailRow label="关联 ID" value={event.correlationId || "—"} mono />
          <DetailRow label="来源记录" value={event.sourceRecordType ? `${event.sourceRecordType}${event.sourceRecordId ? ` / ${event.sourceRecordId}` : ""}` : "—"} mono />
          <DetailRow label="幂等键" value={event.idempotencyKey || "—"} mono />
          <DetailRow label="载荷哈希" value={event.payloadHash || "—"} mono />
        </dl>
        {event.metadata !== null && event.metadata !== undefined && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">安全元数据</p>
            <pre className="max-h-48 overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed">{JSON.stringify(event.metadata, null, 2)}</pre>
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">关联链路</p>
            <span className="text-[11px] text-muted-foreground">{related.length} 条</span>
          </div>
          <div className="space-y-1.5">
            {related.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs">
                <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${item.status === "failed" ? "text-destructive" : "text-muted-foreground"}`} />
                <span className="min-w-0 flex-1 truncate">{item.summary || item.action}</span>
                <span className="shrink-0 text-muted-foreground">{sourceLabels[item.source]}</span>
              </div>
            ))}
            {related.length === 0 && <p className="text-xs text-muted-foreground">暂无关联事件</p>}
          </div>
        </div>
        {event.externalLogUrl && (
          <a className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline" href={event.externalLogUrl} target="_blank" rel="noreferrer">
            在 SLS 中查看原始日志 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </CardContent>
    </Card>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <><dt className="text-muted-foreground">{label}</dt><dd className={`min-w-0 truncate ${mono ? "font-mono" : ""}`}>{value}</dd></>
}

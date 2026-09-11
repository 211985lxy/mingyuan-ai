"use client"

import React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, CheckCircle2, Clock3, Coins, RefreshCw, Server, Target, Users, XCircle } from "lucide-react"
import { toast } from "sonner"

import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Metric = number | null
type Snapshot = {
  publishedCount: number
  qualifiedLeadCount: number
  appointmentCount: number
  dealCount: number
  revenue: number
  paymentCount: number
  paymentAmountCny: number | null
  firstPassAcceptanceRate: number | null
  rewriteRate: number | null
  rejectionRate: number | null
  humanTakeoverCount: number
  p0FailureCount: number
  p1FailureCount: number
  directCostPerSuccess: number | null
  fullyLoadedCost: number | null
  runIdCoverage?: number | null
  costCoverage?: number | null
}

interface Overview {
  period: { from: string; to: string; timezone: string; previousFrom: string; previousTo: string }
  freshness: Array<{ source: string; lastUpdatedAt: string | null; lagMs: number | null; degraded: boolean; reason?: string }>
  operations: {
    runCount: Metric
    successCount: Metric
    failedCount: Metric
    staleRunningCount: Metric
    successRate: Metric
    p50DurationMs: Metric
    p95DurationMs: Metric
    totalTokens: Metric
    totalCostCny: Metric
    coverage: { available: number | null; total: number | null; ratio: number | null; reason?: string }
  }
  business: Snapshot | null
  channels: { days: Array<Record<string, number | string>>; total: Record<string, number>; degraded: boolean; reason?: string }
  dailyTrend: Array<{ day: string; operations: { runCount: number | null; successCount: number | null; failedCount: number | null; successRate: number | null }; channels: Record<string, number> | null }>
  comparison: Record<string, { current: number | null; previous: number | null; delta: number | null; rate: number | null }>
  degradedSources: string[]
}

interface AlertItem {
  id: string
  severity: "warning" | "error" | "critical"
  status: "open" | "acknowledged" | "resolved"
  summary: string
  occurrenceCount: number
  lastSeenAt: string
}

function todayShanghai() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function formatNumber(value: Metric, fraction = 0) {
  if (value == null) return "数据不足"
  return value.toLocaleString("zh-CN", { maximumFractionDigits: fraction, minimumFractionDigits: fraction })
}

function formatPercent(value: Metric) {
  return value == null ? "数据不足" : `${(value * 100).toFixed(1)}%`
}

function toneForFreshness(item: Overview["freshness"][number]) {
  return item.degraded ? "destructive" : "outline"
}

function MetricCard({ title, value, icon: Icon, note }: { title: string; value: string; icon: React.ComponentType<{ className?: string }>; note?: string }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-muted-foreground"><span className="text-xs">{title}</span><Icon className="h-4 w-4" /></div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

function Freshness({ items }: { items: Overview["freshness"] }) {
  return <div className="flex flex-wrap gap-2">{items.map((item) => <Badge key={item.source} variant={toneForFreshness(item)}>{item.source}{item.degraded ? " · 降级" : " · 新鲜"}</Badge>)}</div>
}

function LoadingCard() {
  return <Card><CardContent className="flex min-h-24 items-center justify-center text-sm text-muted-foreground">正在加载…</CardContent></Card>
}

export default function StatisticsPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const today = todayShanghai()
  const [from, setFrom] = React.useState(searchParams.get("from") || shiftDate(today, -6))
  const [to, setTo] = React.useState(searchParams.get("to") || today)
  const [overview, setOverview] = React.useState<Overview | null>(null)
  const [alerts, setAlerts] = React.useState<AlertItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const query = new URLSearchParams({ from, to })
      const [overviewResponse, alertResponse] = await Promise.all([
        fetch(`/api/admin/statistics/overview?${query.toString()}`),
        fetch("/api/admin/alerts?status=open&limit=5"),
      ])
      if (!overviewResponse.ok) throw new Error(`统计数据加载失败 (${overviewResponse.status})`)
      const overviewPayload = await overviewResponse.json() as { data?: Overview }
      setOverview(overviewPayload.data || null)
      if (alertResponse.ok) {
        const alertPayload = await alertResponse.json() as { data?: AlertItem[] }
        setAlerts(Array.isArray(alertPayload.data) ? alertPayload.data : [])
      } else setAlerts([])
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "统计数据加载失败"
      setError(message); setOverview(null); toast.error(message)
    } finally { setLoading(false) }
  }, [from, to])

  React.useEffect(() => { void load() }, [load])

  function choosePreset(days: number) {
    setFrom(shiftDate(todayShanghai(), -(days - 1))); setTo(todayShanghai())
  }

  const operations = overview?.operations
  const business = overview?.business
  return (
    <AdminPageShell
      title="统计中心"
      subtitle="从运营健康、业务结果和数据新鲜度看 AIM 的真实表现。"
      actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button>}
      filter={<div className="flex w-full flex-wrap items-center gap-2 rounded-xl border bg-card p-3"><Button variant="outline" size="sm" onClick={() => choosePreset(1)}>今日</Button><Button variant="outline" size="sm" onClick={() => choosePreset(7)}>7 天</Button><Button variant="outline" size="sm" onClick={() => choosePreset(30)}>30 天</Button><Input aria-label="统计开始日期" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-[148px]" /><span className="text-sm text-muted-foreground">至</span><Input aria-label="统计结束日期" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-[148px]" /></div>}
      loading={loading}
      error={error}
      onRetry={() => void load()}
    >
      {overview && <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><Freshness items={overview.freshness} /><span className="text-xs text-muted-foreground">{overview.period.from} 至 {overview.period.to} · {overview.period.timezone}</span></div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" />运营健康</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><MetricCard title="执行次数" value={formatNumber(operations?.runCount ?? null)} icon={Activity} /><MetricCard title="成功率" value={formatPercent(operations?.successRate ?? null)} icon={CheckCircle2} /><MetricCard title="失败次数" value={formatNumber(operations?.failedCount ?? null)} icon={XCircle} /><MetricCard title="超时运行" value={formatNumber(operations?.staleRunningCount ?? null)} icon={Clock3} /><MetricCard title="P50 时延" value={operations?.p50DurationMs == null ? "数据不足" : `${formatNumber(operations.p50DurationMs)} ms`} icon={Clock3} /><MetricCard title="P95 时延" value={operations?.p95DurationMs == null ? "数据不足" : `${formatNumber(operations.p95DurationMs)} ms`} icon={Clock3} /><MetricCard title="Token" value={formatNumber(operations?.totalTokens ?? null)} icon={BarChart3} /><MetricCard title="成本" value={operations?.totalCostCny == null ? "数据不足" : `¥${formatNumber(operations.totalCostCny, 2)}`} icon={Coins} note={`覆盖率 ${formatPercent(operations?.coverage.ratio ?? null)}`} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" />业务结果</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{business ? <><MetricCard title="发布数" value={formatNumber(business.publishedCount)} icon={BarChart3} /><MetricCard title="合格线索" value={formatNumber(business.qualifiedLeadCount)} icon={Users} /><MetricCard title="预约" value={formatNumber(business.appointmentCount)} icon={Clock3} /><MetricCard title="成交" value={formatNumber(business.dealCount)} icon={Target} note={comparisonNote(overview.comparison.dealCount)} /><MetricCard title="收入" value={`¥${formatNumber(business.revenue, 2)}`} icon={Coins} note={comparisonNote(overview.comparison.revenue)} /><MetricCard title="回款次数" value={formatNumber(business.paymentCount)} icon={CheckCircle2} /><MetricCard title="首稿通过率" value={formatPercent(business.firstPassAcceptanceRate)} icon={CheckCircle2} /><MetricCard title="人工接管" value={formatNumber(business.humanTakeoverCount)} icon={Users} /><MetricCard title="P0 / P1" value={`${formatNumber(business.p0FailureCount)} / ${formatNumber(business.p1FailureCount)}`} icon={AlertTriangle} /><MetricCard title="单次成功成本" value={business.directCostPerSuccess == null ? "数据不足" : `¥${formatNumber(business.directCostPerSuccess, 2)}`} icon={Coins} /></> : <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">业务指标暂不可用，请检查数据源新鲜度。</div>}</CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" />统一日趋势</CardTitle></CardHeader><CardContent>{overview.dailyTrend.length === 0 ? <p className="text-sm text-muted-foreground">当前周期暂无日趋势。</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2">日期</th><th className="px-2 py-2 text-right">执行</th><th className="px-2 py-2 text-right">成功</th><th className="px-2 py-2 text-right">失败</th><th className="px-2 py-2 text-right">成功率</th><th className="px-2 py-2">渠道指标</th></tr></thead><tbody>{overview.dailyTrend.map((day) => <tr key={day.day} className="border-b last:border-0"><td className="px-2 py-2 font-mono text-xs">{day.day}</td><td className="px-2 py-2 text-right tabular-nums">{formatNumber(day.operations.runCount)}</td><td className="px-2 py-2 text-right tabular-nums">{formatNumber(day.operations.successCount)}</td><td className="px-2 py-2 text-right tabular-nums">{formatNumber(day.operations.failedCount)}</td><td className="px-2 py-2 text-right tabular-nums">{formatPercent(day.operations.successRate)}</td><td className="px-2 py-2">{day.channels == null ? <span className="text-muted-foreground">数据不足</span> : Object.keys(day.channels).length === 0 ? <span className="text-muted-foreground">—</span> : <div className="flex flex-wrap gap-1.5">{Object.entries(day.channels).map(([key, value]) => <Badge key={key} variant="outline">{key}: {formatNumber(value)}</Badge>)}</div>}</td></tr>)}</tbody></table></div>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4 text-primary" />渠道日趋势</CardTitle></CardHeader><CardContent>{overview.channels.degraded ? <p className="text-sm text-muted-foreground">{overview.channels.reason || "渠道指标暂不可用"}</p> : overview.channels.days.length === 0 ? <p className="text-sm text-muted-foreground">当前周期暂无渠道日指标。</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2">日期</th><th className="px-2 py-2">平台指标</th><th className="px-2 py-2 text-right">合计</th></tr></thead><tbody>{overview.channels.days.map((day) => <tr key={String(day.day)} className="border-b last:border-0"><td className="px-2 py-2 font-mono text-xs">{String(day.day)}</td><td className="px-2 py-2"><div className="flex flex-wrap gap-1.5">{Object.entries(day).filter(([key]) => key !== "day").map(([key, value]) => <Badge key={key} variant="outline">{key}: {formatNumber(typeof value === "number" ? value : null)}</Badge>)}</div></td><td className="px-2 py-2 text-right tabular-nums">{formatNumber(Object.entries(day).filter(([key]) => key !== "day").reduce((sum, [, value]) => sum + (typeof value === "number" ? value : 0), 0))}</td></tr>)}</tbody></table></div>}</CardContent></Card>
        <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" />待处理告警</CardTitle><Link href="/admin/alerts" className="text-xs text-primary hover:underline">查看全部 <ArrowUpRight className="inline h-3 w-3" /></Link></CardHeader><CardContent>{alerts.length === 0 ? <p className="text-sm text-muted-foreground">当前没有未解决告警。</p> : <div className="space-y-2">{alerts.map((alert) => <div key={alert.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span className="flex items-center gap-2"><Badge variant={alert.severity === "critical" || alert.severity === "error" ? "destructive" : "secondary"}>{alert.severity}</Badge>{alert.summary}</span><span className="text-xs text-muted-foreground">{alert.occurrenceCount} 次</span></div>)}</div>}</CardContent></Card>
      </div>}
      {!overview && !loading && !error && <LoadingCard />}
    </AdminPageShell>
  )
}

function comparisonNote(value: Overview["comparison"][string] | undefined) {
  if (!value || value.rate == null) return "上一周期数据不足"
  const sign = value.rate > 0 ? "+" : ""
  return `较上周期 ${sign}${(value.rate * 100).toFixed(1)}%`
}

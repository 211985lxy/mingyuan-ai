"use client"

import React from "react"
import { AlertTriangle, Check, RefreshCw, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type AlertItem = {
  id: string
  fingerprint: string
  rule: string
  severity: "warning" | "error" | "critical"
  status: "open" | "acknowledged" | "resolved"
  summary: string
  source: string
  occurrenceCount: number
  lastSeenAt: string
  correlationId: string | null
}

function label(status: AlertItem["status"]) {
  return status === "open" ? "未处理" : status === "acknowledged" ? "已确认" : "已解决"
}

export default function AlertsPage() {
  const [alerts, setAlerts] = React.useState<AlertItem[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/alerts?limit=100")
      if (!response.ok) throw new Error(`告警加载失败 (${response.status})`)
      const payload = await response.json() as { data?: AlertItem[] }
      setAlerts(Array.isArray(payload.data) ? payload.data : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "告警加载失败")
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { void load() }, [load])

  async function transition(id: string, next: "acknowledged" | "resolved" | "reopened") {
    try {
      const response = await fetch(`/api/admin/alerts/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ transition: next }) })
      if (!response.ok) throw new Error(`告警更新失败 (${response.status})`)
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : "告警更新失败") }
  }

  return (
    <AdminPageShell title="告警中心" subtitle="集中处理审计对账、AIM 运行和基础设施异常。" actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button>} loading={loading} empty={!loading && alerts.length === 0} emptyMessage="当前没有告警">
      <div className="space-y-3">{alerts.map((alert) => <Card key={alert.id}><CardContent className="flex flex-wrap items-center gap-3"><AlertTriangle className={`h-5 w-5 shrink-0 ${alert.severity === "critical" || alert.severity === "error" ? "text-destructive" : "text-amber-600"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant={alert.severity === "critical" || alert.severity === "error" ? "destructive" : "secondary"}>{alert.severity}</Badge><Badge variant="outline">{label(alert.status)}</Badge><span className="text-xs text-muted-foreground">{alert.rule}</span></div><p className="mt-1 text-sm font-medium">{alert.summary}</p><p className="mt-1 text-xs text-muted-foreground">{alert.source} · {alert.occurrenceCount} 次 · 最近 {new Date(alert.lastSeenAt).toLocaleString("zh-CN")}{alert.correlationId ? ` · ${alert.correlationId}` : ""}</p></div><div className="flex items-center gap-1.5">{alert.status === "open" && <Button size="sm" variant="outline" onClick={() => void transition(alert.id, "acknowledged")}><Check className="mr-1 h-3.5 w-3.5" />确认</Button>}{alert.status !== "resolved" && <Button size="sm" variant="outline" onClick={() => void transition(alert.id, "resolved")}>解决</Button>}{alert.status === "resolved" && <Button size="sm" variant="ghost" onClick={() => void transition(alert.id, "reopened")}><RotateCcw className="mr-1 h-3.5 w-3.5" />重开</Button>}</div></CardContent></Card>)}</div>
    </AdminPageShell>
  )
}

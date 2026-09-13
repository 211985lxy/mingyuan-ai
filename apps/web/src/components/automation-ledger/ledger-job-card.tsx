import { AlertTriangle, CheckCircle2, Clock3, Pause, Play, PlayCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { AutomationHealth, AutomationLedgerJob } from "@/lib/aim/automation-ledger"

function healthBadge(health: AutomationHealth, label: string) {
  if (health === "down") return <Badge variant="destructive">{label}</Badge>
  if (health === "attention") return <Badge variant="secondary">{label}</Badge>
  return <Badge variant="outline">{label}</Badge>
}

function formatTime(value: string | null) {
  if (!value) return "没有成功执行记录"
  return new Date(value).toLocaleString("zh-CN", { hour12: false })
}

export function LedgerJobCard(props: {
  job: AutomationLedgerJob
  busy?: boolean
  onRun?: (jobId: AutomationLedgerJob["id"]) => void
  onToggle?: (jobId: AutomationLedgerJob["id"], enabled: boolean) => void
  actionError?: string | null
}) {
  const { job, busy, onRun, onToggle, actionError } = props
  return (
    <Card className="border-border/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{job.name}</CardTitle>
            <CardDescription>{job.purpose}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            {healthBadge(job.health, job.healthLabel)}
            {!job.enabled ? <Badge variant="secondary">已空转</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock3 className="h-4 w-4 shrink-0" />
          {job.schedule} · {job.owner}
        </div>
        <p>上次执行：{formatTime(job.lastRunAt)}</p>
        <p className="text-xs leading-5 text-muted-foreground">{job.lastRunNote}</p>
        {job.latestAlert ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>{job.latestAlert.summary}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            当前没有未处理告警
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" disabled={busy || !job.enabled} onClick={() => onRun?.(job.id)}>
            <Play className="mr-1 h-3.5 w-3.5" />
            立即执行
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onToggle?.(job.id, !job.enabled)}>
            {job.enabled ? <Pause className="mr-1 h-3.5 w-3.5" /> : <PlayCircle className="mr-1 h-3.5 w-3.5" />}
            {job.enabled ? "停用（空转）" : "恢复执行"}
          </Button>
        </div>
        {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
      </CardContent>
    </Card>
  )
}

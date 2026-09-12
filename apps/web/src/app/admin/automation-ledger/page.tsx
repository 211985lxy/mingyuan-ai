"use client"

import React from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { backgroundKindLabel, type AutomationLedger, type AutomationTaskStatus } from "@/lib/aim/automation-ledger"

const STATUS_LABEL: Record<AutomationTaskStatus, string> = {
  healthy: "未见异常",
  degraded: "有告警",
  failing: "有错误",
  idle: "近期无运行",
}

const STATUS_VARIANT: Record<AutomationTaskStatus, "secondary" | "destructive" | "outline" | "default"> = {
  healthy: "secondary",
  degraded: "outline",
  failing: "destructive",
  idle: "outline",
}

type LedgerResponse = AutomationLedger

function ScheduledTaskItem({ row }: { row: AutomationLedger["scheduled"][number] }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.name}</span>
        <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
        <Badge variant="secondary">{row.cadence}</Badge>
        {row.openErrorCount > 0 ? <Badge variant="destructive">错误 {row.openErrorCount}</Badge> : null}
        {row.openWarningCount > 0 ? <Badge variant="outline">警告 {row.openWarningCount}</Badge> : null}
        <code className="ml-auto text-xs text-muted-foreground">{row.endpoint}</code>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
      {row.latestAlertSummary ? (
        <p className="mt-1 text-xs text-destructive">
          最新告警（{row.latestAlertAt ? new Date(row.latestAlertAt).toLocaleString() : "未知时间"}）：{row.latestAlertSummary}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">
        Owner：{row.ownerNote} · 停用条件：{row.disableCondition}
      </p>
    </div>
  )
}

function LedgerSummary({ summary, generatedAt }: { summary: AutomationLedger["summary"]; generatedAt: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="secondary">未见异常 {summary.healthy}</Badge>
      <Badge variant="outline">有告警 {summary.degraded}</Badge>
      <Badge variant="destructive">有错误 {summary.failing}</Badge>
      <Badge variant="outline">近期无运行 {summary.idle}</Badge>
      <span className="text-muted-foreground">生成于 {new Date(generatedAt).toLocaleString()}</span>
    </div>
  )
}

function BackgroundTaskItem({ row }: { row: AutomationLedger["background"][number] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <span className="font-medium">{backgroundKindLabel(row.kind)}</span>
      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
      <span className="text-xs text-muted-foreground">
        近 7 天完成 {row.completedRecent} · 失败 {row.failedRecent} · 排队 {row.queued}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {row.lastCompletedAt ? `最近完成 ${new Date(row.lastCompletedAt).toLocaleString()}` : "近期无完成记录"}
      </span>
    </div>
  )
}

export default function AutomationLedgerPage() {
  const [ledger, setLedger] = React.useState<LedgerResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/automation-ledger", { cache: "no-store" })
      if (!response.ok) throw new Error(`台账加载失败 (${response.status})`)
      const payload = (await response.json()) as LedgerResponse
      if (!payload || !Array.isArray(payload.scheduled)) throw new Error("台账数据格式异常")
      setLedger(payload)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "台账加载失败"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const summary = ledger?.summary

  return (
    <AdminPageShell
      title="自动化台账"
      subtitle="系统每天自动在跑的定时能力与后台任务：职责、健康态、Owner 与停用条件。V1 只读；启停与立即执行在 V2 开放。"
      loading={loading}
      error={error}
      onRetry={load}
      skeletonRows={8}
      empty={!ledger}
      emptyMessage="暂无台账数据"
      actions={
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      }
      stats={summary ? <LedgerSummary summary={summary} generatedAt={ledger.generatedAt} /> : null}
    >
      <Card>
        <CardHeader>
          <CardTitle>定时能力</CardTitle>
          <CardDescription>
            与 vercel.json / ops/systemd 对齐的定时任务注册表。V1 健康态来自未关闭告警；定时 cron 的「上次执行」需要 V2 接入持久化运行记录。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ledger?.scheduled.map((row) => <ScheduledTaskItem key={row.id} row={row} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>耐久后台任务</CardTitle>
          <CardDescription>近 7 天执行记录（BackgroundTask 表）：失败优先置顶；排队积压超过 20 判定为降级。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ledger && ledger.background.length > 0 ? (
            ledger.background.map((row) => <BackgroundTaskItem key={row.kind} row={row} />)
          ) : (
            <p className="text-sm text-muted-foreground">近 7 天没有后台任务执行记录。</p>
          )}
        </CardContent>
      </Card>
    </AdminPageShell>
  )
}

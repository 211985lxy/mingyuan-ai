"use client"

import Link from "next/link"
import { RefreshCw } from "lucide-react"

import { LedgerJobCard } from "@/components/automation-ledger/ledger-job-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import type { AutomationLedger } from "@/lib/api/automation-ledger"

export function AutomationLedgerView(props: {
  ledger: AutomationLedger | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  busyJobId?: string | null
  jobActionError?: Record<string, string>
  onRun?: (jobId: NonNullable<AutomationLedger["jobs"][number]["id"]>) => void
  onToggle?: (jobId: NonNullable<AutomationLedger["jobs"][number]["id"]>, enabled: boolean) => void
}) {
  const { ledger, loading, error, onRefresh, busyJobId, jobActionError, onRun, onToggle } = props
  return (
    <div className="space-y-6 pb-10">
      <WorkbenchHero
        title="自动化台账"
        subtitle="系统每天自动帮你做的事。立即执行和空转开关要管理员账号，不会停掉生产定时器。"
        badge={<Badge variant="secondary">台账</Badge>}
        actions={
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        }
      />
      {ledger ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>暂无告警</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{ledger.summary.ok}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>需留意</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{ledger.summary.attention}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>出问题</CardDescription>
              <CardTitle className="text-2xl tabular-nums text-destructive">{ledger.summary.down}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}
      {error ? <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card> : null}
      {loading && !ledger ? <p className="text-sm text-muted-foreground">正在读取台账…</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {(ledger?.jobs ?? []).map((job) => (
          <LedgerJobCard
            key={job.id}
            job={job}
            busy={busyJobId === job.id}
            onRun={onRun}
            onToggle={onToggle}
            actionError={jobActionError?.[job.id] ?? null}
          />
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>停用只让任务空转，不停生产定时器。立即执行五分钟内不能连点，且会留下管理员审计。</span>
          <Link href="/account/your-data" className="text-sm text-primary hover:underline">
            你的数据
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

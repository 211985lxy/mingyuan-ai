import { NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import {
  AUTOMATION_TASK_SPECS,
  buildAutomationLedger,
  type LedgerAlertInput,
  type LedgerKindStatsInput,
} from "@/lib/aim/automation-ledger"

export const dynamic = "force-dynamic"

const RECENT_WINDOW_DAYS = 7

/**
 * 自动化台账（WP-A2 V1，只读）：
 * 未关闭告警 + 近 7 天后台任务执行记录 → 每个定时能力/后台任务类型的健康态。
 * 定时 cron 无持久化运行记录，V1 只呈现告警信号（行内如实标注）。
 */
export const GET = withAdminOnly(async () => {
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [alertRows, queuedAgg, failedAgg, completedAgg] = await Promise.all([
    prisma.operationalAlert.findMany({
      where: { status: { not: "resolved" } },
      select: { source: true, severity: true, status: true, summary: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
      take: 200,
    }),
    prisma.backgroundTask.groupBy({
      by: ["kind"],
      where: { status: "queued" },
      _count: true,
    }),
    prisma.backgroundTask.groupBy({
      by: ["kind"],
      where: { status: "failed", updatedAt: { gte: since } },
      _count: true,
    }),
    prisma.backgroundTask.groupBy({
      by: ["kind"],
      where: { status: "completed", completedAt: { gte: since } },
      _count: true,
      _max: { completedAt: true },
    }),
  ])

  const queuedByKind = new Map(queuedAgg.map((row) => [row.kind, row._count]))
  const failedByKind = new Map(failedAgg.map((row) => [row.kind, row._count]))
  const completedByKind = new Map(completedAgg.map((row) => [row.kind, row._count]))
  const lastCompletedByKind = new Map(
    completedAgg.map((row) => [row.kind, row._max.completedAt ?? null]),
  )

  const kinds = new Set<string>([
    ...queuedByKind.keys(),
    ...failedByKind.keys(),
    ...completedByKind.keys(),
  ])

  const backgroundStats: LedgerKindStatsInput[] = [...kinds].map((kind) => ({
    kind,
    queued: queuedByKind.get(kind) ?? 0,
    failedRecent: failedByKind.get(kind) ?? 0,
    completedRecent: completedByKind.get(kind) ?? 0,
    lastCompletedAt: lastCompletedByKind.get(kind)?.toISOString() ?? null,
  }))

  const alerts: LedgerAlertInput[] = alertRows.map((row) => ({
    source: row.source,
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    lastSeenAt: row.lastSeenAt.toISOString(),
  }))

  const ledger = buildAutomationLedger(
    AUTOMATION_TASK_SPECS,
    alerts,
    backgroundStats,
    new Date().toISOString(),
  )

  return NextResponse.json(ledger)
})

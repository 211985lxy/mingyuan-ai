import { NextRequest, NextResponse } from "next/server"

import { withAdminAuth } from "@/lib/admin-auth"
import {
  aggregateRunOutcomeMetrics,
  type RunOutcomeMetricFilters,
} from "@/lib/aim/run-outcome-metrics"
import type { RunOutcomeChannel } from "@/lib/aim/run-outcome-telemetry"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000
const TRACE_LIMIT = 10_000
const EVENT_LIMIT = 100_000
const CHANNELS = new Set<RunOutcomeChannel>(["web", "feishu", "api"])

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function loadMetricRunUniverse(start: Date, end: Date) {
  // AimExecutionTrace has no completedAt; terminal status + updatedAt is its completion window.
  const traces = await prisma.aimExecutionTrace.findMany({
    where: {
      status: { in: ["success", "failed"] },
      updatedAt: { gte: start, lt: end },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: TRACE_LIMIT + 1,
    select: {
      id: true,
      runId: true,
      durationMs: true,
      costCny: true,
      aimGenerationId: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (traces.length > TRACE_LIMIT) {
    return { ok: false as const, error: "执行记录超过查询上限，请缩短时间范围" }
  }
  const runIds = [...new Set(
    traces.flatMap((trace) => trace.runId ? [trace.runId] : []),
  )]
  const events = runIds.length === 0
    ? []
    : await prisma.aimRunEvent.findMany({
      where: {
        runId: { in: runIds },
        OR: [
          { finalDisposition: { not: null } },
          { event: { in: ["edited", "revised"] } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EVENT_LIMIT + 1,
      select: { id: true, runId: true, event: true, metadata: true, createdAt: true },
    })
  if (events.length > EVENT_LIMIT) {
    return { ok: false as const, error: "结果事件超过查询上限，请缩短时间范围" }
  }
  return { ok: true as const, traces, events }
}

/** Read-only operating telemetry with bounded period and trace-derived cost. */
export const GET = withAdminAuth(async (request: NextRequest) => {
  const now = new Date()
  const end = parseDate(request.nextUrl.searchParams.get("end"), now)
  const start = parseDate(
    request.nextUrl.searchParams.get("start"),
    new Date(now.getTime() - 7 * DAY_MS),
  )
  if (!start || !end || start >= end || end.getTime() - start.getTime() > 31 * DAY_MS) {
    return NextResponse.json({ error: "查询周期必须是有效且不超过 31 天的 [start,end)" }, { status: 400 })
  }
  const channelParam = request.nextUrl.searchParams.get("channel")
  if (channelParam && !CHANNELS.has(channelParam as RunOutcomeChannel)) {
    return NextResponse.json({ error: "channel 不合法" }, { status: 400 })
  }
  const humanHourlyCostCny = Number(request.nextUrl.searchParams.get("humanHourlyCostCny") ?? "0")
  if (!Number.isFinite(humanHourlyCostCny) || humanHourlyCostCny < 0 || humanHourlyCostCny > 10_000) {
    return NextResponse.json({ error: "humanHourlyCostCny 不合法" }, { status: 400 })
  }

  const loaded = await loadMetricRunUniverse(start, end)
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 413 })
  }
  const filters: RunOutcomeMetricFilters = {
    workflowId: request.nextUrl.searchParams.get("workflowId")?.trim() || undefined,
    taskType: request.nextUrl.searchParams.get("taskType")?.trim() || undefined,
    channel: (channelParam || undefined) as RunOutcomeChannel | undefined,
  }
  const metrics = aggregateRunOutcomeMetrics({
    events: loaded.events,
    traces: loaded.traces,
    filters,
    humanHourlyCostCny,
  })
  return NextResponse.json({
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    filters,
    humanHourlyCostCny,
    metrics,
  })
}, "admin")

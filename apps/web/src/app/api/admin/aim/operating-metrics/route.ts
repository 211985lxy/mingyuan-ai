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
const CHANNELS = new Set<RunOutcomeChannel>(["web", "feishu", "api"])

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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

  const [events, traces] = await Promise.all([
    prisma.aimRunEvent.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "asc" },
      take: 10_000,
      select: { runId: true, event: true, metadata: true, createdAt: true },
    }),
    prisma.aimExecutionTrace.findMany({
      where: {
        status: { in: ["success", "failed"] },
        createdAt: { gte: start, lt: end },
      },
      orderBy: { createdAt: "asc" },
      take: 10_000,
      select: { runId: true, durationMs: true, costCny: true, createdAt: true },
    }),
  ])
  const filters: RunOutcomeMetricFilters = {
    workflowId: request.nextUrl.searchParams.get("workflowId")?.trim() || undefined,
    taskType: request.nextUrl.searchParams.get("taskType")?.trim() || undefined,
    channel: (channelParam || undefined) as RunOutcomeChannel | undefined,
  }
  const metrics = aggregateRunOutcomeMetrics({
    events,
    traces,
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

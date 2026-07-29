import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import {
  loadBusinessAttributionSource as collectLarkBusinessAttributionSource,
  readBusinessAttributionSyncConfig,
} from "@/lib/aim/business-attribution-sync"
import {
  aggregateCohortStats,
  isCohortDimension,
  type PreviousCohortMetric,
} from "@/lib/aim/operating-cohort"
import {
  buildOperatingCohortRecords,
  loadOperatingCohortEnrichment,
} from "@/lib/aim/operating-cohort-source"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_WINDOW_MS = 366 * DAY_MS

function date(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function parseCohortQuery(request: NextRequest) {
  const now = new Date()
  const rawEnd = request.nextUrl.searchParams.get("end")
  const rawStart = request.nextUrl.searchParams.get("start")
  const parsedEnd = date(rawEnd)
  const parsedStart = date(rawStart)
  if ((rawEnd && !parsedEnd) || (rawStart && !parsedStart)) {
    return { ok: false as const, error: "start/end 必须是有效日期" }
  }
  const end = parsedEnd ?? now
  const start =
    parsedStart
    ?? new Date(end.getTime() - 28 * DAY_MS)
  const requestedDimension = request.nextUrl.searchParams.get("dimension")
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || undefined
  if (
    start >= end
    || end.getTime() - start.getTime() > MAX_WINDOW_MS
  ) return { ok: false as const, error: "分析窗口必须有效且不超过 366 天" }
  if (requestedDimension && !isCohortDimension(requestedDimension)) {
    return { ok: false as const, error: "dimension 非法" }
  }
  return { ok: true as const, start, end, requestedDimension, projectId }
}

export const GET = withAdminAuth(async (request: NextRequest) => {
  const query = parseCohortQuery(request)
  if (!query.ok) {
    return NextResponse.json({ error: query.error }, { status: 400 })
  }
  const { start, end, requestedDimension, projectId } = query
  try {
    const config = readBusinessAttributionSyncConfig()
    const snapshot = await collectLarkBusinessAttributionSource({ config })
    const enrichment = await loadOperatingCohortEnrichment({
      snapshot,
      db: prisma,
    })
    const durationMs = end.getTime() - start.getTime()
    const previousStart = new Date(start.getTime() - durationMs)
    const current = buildOperatingCohortRecords({
      snapshot,
      enrichment,
      start,
      end,
      projectId,
    })
    const previous = buildOperatingCohortRecords({
      snapshot,
      enrichment,
      start: previousStart,
      end: start,
      projectId,
    })
    const previousStats = aggregateCohortStats(previous.records)
    const previousByGroup = Object.fromEntries(previousStats.map((item) => [
      `${item.dimension}::${item.segmentKey}`,
      {
        leadToAppointmentRate: item.leadToAppointmentRate,
        sampleSize: item.sampleSize,
      } satisfies PreviousCohortMetric,
    ]))
    const items = aggregateCohortStats(current.records, {
      previousLeadToAppointmentByGroup: previousByGroup,
    }).filter((item) =>
      !requestedDimension || item.dimension === requestedDimension)
    return NextResponse.json({
      method: "descriptive",
      predictionUsed: false,
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        previousStart: previousStart.toISOString(),
        previousEnd: start.toISOString(),
      },
      source: {
        system: "feishu_base",
        tableId: config.tableId,
        observedFieldTypes: Object.fromEntries(
          snapshot.fields.map((field) => [field.name, field.type]),
        ),
      },
      diagnostics: current.diagnostics,
      items,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "客户分群经营分析失败",
    }, { status: 409 })
  }
}, "admin")

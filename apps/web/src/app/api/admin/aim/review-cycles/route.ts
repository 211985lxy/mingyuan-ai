import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { withAdminAuth } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  createReviewCycle,
} from "@/lib/aim/review-cycle-store"
import {
  loadReviewMetricsSnapshot,
} from "@/lib/aim/review-cycle-metrics"
import type { ReviewCycleFilters } from "@/lib/aim/review-cycle"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function date(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function parseFilters(value: unknown): ReviewCycleFilters | null {
  if (value == null) return {}
  if (typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const channel = row.channel
  if (channel != null && channel !== "web" && channel !== "feishu" && channel !== "api") {
    return null
  }
  const optional = (key: string) =>
    typeof row[key] === "string" && row[key].trim()
      ? row[key].trim()
      : undefined
  return {
    projectId: optional("projectId"),
    workflowId: optional("workflowId"),
    ownerId: optional("ownerId"),
    channel: channel as ReviewCycleFilters["channel"],
  }
}

async function isActiveSystemOwner(systemOwnerId: string): Promise<boolean> {
  const assignment = await prisma.governanceAssignment.findFirst({
    where: {
      scopeType: "system",
      role: "system_owner",
      status: "active",
      effectiveAt: { lte: new Date() },
      OR: [
        { userId: systemOwnerId },
        { externalOpenId: systemOwnerId },
        { externalUserId: systemOwnerId },
      ],
    },
    select: { id: true },
  })
  return Boolean(assignment)
}

export const GET = withAdminAuth(async (request: NextRequest) => {
  const status = request.nextUrl.searchParams.get("status")?.trim()
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim()
  const workflowId = request.nextUrl.searchParams.get("workflowId")?.trim()
  const ownerId = request.nextUrl.searchParams.get("ownerId")?.trim()
  const channel = request.nextUrl.searchParams.get("channel")?.trim()
  const rows = await prisma.reviewCycle.findMany({
    where: status ? { status } : {},
    include: { actions: true },
    orderBy: [{ periodStart: "desc" }, { id: "desc" }],
    take: 100,
  })
  const items = rows.filter((row) => {
    const filters =
      row.filterSnapshot
      && typeof row.filterSnapshot === "object"
      && !Array.isArray(row.filterSnapshot)
        ? row.filterSnapshot as Record<string, unknown>
        : {}
    return (
      (!projectId || filters.projectId === projectId)
      && (!workflowId || filters.workflowId === workflowId)
      && (!ownerId || filters.ownerId === ownerId)
      && (!channel || filters.channel === channel)
    )
  })
  return NextResponse.json({ items })
}, "admin")

export const POST = withAdminAuth(async (request: NextRequest, { admin }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const periodStart = date(body.periodStart)
  const periodEnd = date(body.periodEnd)
  const requestId = typeof body.requestId === "string" ? body.requestId : ""
  const systemOwnerId =
    typeof body.systemOwnerId === "string" ? body.systemOwnerId.trim() : ""
  const filters = parseFilters(body.filterSnapshot)
  const actions = Array.isArray(body.actions) ? body.actions : []
  const humanHourlyCostCny = Number(body.humanHourlyCostCny ?? 0)
  if (
    !periodStart
    || !periodEnd
    || !filters
    || !Number.isFinite(humanHourlyCostCny)
    || humanHourlyCostCny < 0
    || humanHourlyCostCny > 10_000
  ) {
    return NextResponse.json({ error: "周期、筛选条件或人工时薪不合法" }, { status: 400 })
  }
  if (!await isActiveSystemOwner(systemOwnerId)) {
    return NextResponse.json({ error: "systemOwnerId 不是当前 active 系统 Owner" }, { status: 403 })
  }
  try {
    const metricsSnapshot = await loadReviewMetricsSnapshot({
      periodStart,
      periodEnd,
      filters,
      humanHourlyCostCny,
    })
    const result = await createReviewCycle({
      draft: {
        requestId,
        periodStart,
        periodEnd,
        systemOwnerId,
        metricsSnapshot,
        filterSnapshot: filters,
      },
      actions: actions.map((action) => {
        const row = action && typeof action === "object"
          ? action as Record<string, unknown>
          : {}
        return {
          title: typeof row.title === "string" ? row.title : "",
          ownerId: typeof row.ownerId === "string" ? row.ownerId : "",
          dueAt: date(row.dueAt) ?? new Date(Number.NaN),
          evidenceRef: typeof row.evidenceRef === "string" ? row.evidenceRef : undefined,
        }
      }),
    })
    const auditId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "review_cycle.create",
      targetType: "review_cycle",
      targetId: result.record.id,
      metadata: json({ requestId, created: result.created }),
    })
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: { "x-request-id": auditId },
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "周复盘创建失败",
    }, { status: 409 })
  }
}, "admin")

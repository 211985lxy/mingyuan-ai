import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"

type AuditDelegate = {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>
  count(args: unknown): Promise<number>
}

function getDelegate(): AuditDelegate | undefined {
  return (prisma as typeof prisma & { auditEvent?: AuditDelegate }).auditEvent
}

function shanghaiTodayBounds(now = new Date()): { start: Date; end: Date } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  return {
    start: new Date(`${date}T00:00:00+08:00`),
    end: new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000),
  }
}

function parseDateBounds(value: string | null): { start: Date; end: Date } {
  if (!value) return shanghaiTodayBounds()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date must be YYYY-MM-DD")
  const start = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(start.getTime())) throw new Error("date is invalid")
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

export const GET = withAdminOnly(async (request: NextRequest, { admin }) => {
  const delegate = getDelegate()
  if (!delegate) return NextResponse.json({ error: "AuditEvent client is not generated" }, { status: 503 })

  const url = new URL(request.url)
  let bounds: { start: Date; end: Date }
  try {
    bounds = parseDateBounds(url.searchParams.get("date"))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid date" }, { status: 400 })
  }

  const requestedLimit = Number(url.searchParams.get("limit") || "50")
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 50
  const where: Record<string, unknown> = {
    occurredAt: { gte: bounds.start, lt: bounds.end },
  }
  for (const key of ["source", "category", "severity", "status", "projectId", "correlationId", "actorIdHash"] as const) {
    const value = url.searchParams.get(key)
    if (value) where[key] = value
  }
  const action = url.searchParams.get("action")
  if (action) where.action = { contains: action }

  const cursor = url.searchParams.get("cursor")
  const rows = await delegate.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      occurredAt: true,
      source: true,
      category: true,
      severity: true,
      status: true,
      action: true,
      summary: true,
      actorType: true,
      actorIdHash: true,
      targetType: true,
      targetId: true,
      projectId: true,
      environment: true,
      correlationId: true,
      requestId: true,
      traceId: true,
      gitSha: true,
      sourceRecordType: true,
      sourceRecordId: true,
      idempotencyKey: true,
      metadata: true,
      externalLogUrl: true,
    },
  })
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? String(data[data.length - 1]?.id || "") : null
  const total = await delegate.count({ where })
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "audit_events.read",
    targetType: "audit_event_list",
    metadata: { limit, resultCount: data.length },
  })
  return NextResponse.json({ data, total, nextCursor }, { headers: { "x-request-id": requestId } })
})

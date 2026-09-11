import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"
import { auditEventCursor, encodeAuditEventCursor } from "@/lib/audit-event-query"

type RelatedDelegate = {
  findUnique(args: unknown): Promise<{ correlationId?: string | null } | null>
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>
}

function getDelegate(): RelatedDelegate | undefined {
  return (prisma as typeof prisma & { auditEvent?: RelatedDelegate }).auditEvent
}

export const GET = withAdminOnly(async (request: NextRequest, { admin, params }) => {
  const id = params?.id
  const delegate = getDelegate()
  if (!id) return NextResponse.json({ error: "Audit event id is required" }, { status: 400 })
  if (!delegate) return NextResponse.json({ error: "AuditEvent client is not generated" }, { status: 503 })
  const event = await delegate.findUnique({ where: { id }, select: { correlationId: true } })
  if (!event) return NextResponse.json({ error: "Audit event not found" }, { status: 404 })
  if (!event.correlationId) return NextResponse.json({ data: [], nextCursor: null })
  const url = new URL(request.url)
  const requestedLimit = Number(url.searchParams.get("limit") || "50")
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 50
  let cursor: ReturnType<typeof auditEventCursor>
  try {
    cursor = auditEventCursor(url.searchParams.get("cursor")?.trim() || null)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "cursor 无效" }, { status: 400 })
  }
  const where = cursor?.occurredAt
    ? { correlationId: event.correlationId, AND: [{ OR: [{ occurredAt: { gt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { gt: cursor.id } }] }] }
    : { correlationId: event.correlationId }
  const legacyCursor = cursor && !cursor.occurredAt ? { cursor: { id: cursor.id }, skip: 1 } : {}
  const rows = await delegate.findMany({
    where,
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...legacyCursor,
  })
  const data = rows.length > limit ? rows.slice(0, limit) : rows
  const last = data[data.length - 1]
  const nextCursor = rows.length > limit && typeof last?.id === "string" && last.occurredAt instanceof Date
    ? encodeAuditEventCursor({ id: last.id, occurredAt: last.occurredAt })
    : null
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "audit_events.related.read",
    targetType: "audit_event",
    targetId: id,
    metadata: { resultCount: data.length },
  })
  return NextResponse.json({ data, nextCursor }, { headers: { "x-request-id": requestId } })
})

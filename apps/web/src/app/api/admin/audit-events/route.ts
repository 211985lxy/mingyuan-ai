import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"
import { auditEventCursor, AUDIT_EVENT_SELECT, encodeAuditEventCursor, parseAuditEventQuery } from "@/lib/audit-event-query"

type AuditDelegate = {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>
  count(args: unknown): Promise<number>
}

function getDelegate(): AuditDelegate | undefined {
  return (prisma as typeof prisma & { auditEvent?: AuditDelegate }).auditEvent
}

export const GET = withAdminOnly(async (request: NextRequest, { admin }) => {
  const delegate = getDelegate()
  if (!delegate) return NextResponse.json({ error: "AuditEvent client is not generated" }, { status: 503 })

  const url = new URL(request.url)
  const parsed = parseAuditEventQuery(url.searchParams)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { where, limit, cursor } = parsed
  let cursorWhere: Record<string, unknown> | undefined
  try {
    cursorWhere = auditEventCursor(cursor)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "cursor 无效" }, { status: 400 })
  }
  const listWhere = cursorWhere?.occurredAt
    ? { ...where, AND: [{ OR: [{ occurredAt: { lt: cursorWhere.occurredAt } }, { occurredAt: cursorWhere.occurredAt, id: { lt: cursorWhere.id } }] }] }
    : where
  const legacyCursor = cursorWhere && !cursorWhere.occurredAt ? { cursor: { id: cursorWhere.id }, skip: 1 } : {}
  const rows = await delegate.findMany({
    where: listWhere,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...legacyCursor,
    select: AUDIT_EVENT_SELECT,
  })
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const last = data[data.length - 1]
  const nextCursor = hasMore && last?.id && last.occurredAt instanceof Date
    ? encodeAuditEventCursor({ id: String(last.id), occurredAt: last.occurredAt })
    : null
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

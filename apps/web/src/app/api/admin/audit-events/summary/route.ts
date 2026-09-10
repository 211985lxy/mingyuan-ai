import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { parseAuditEventQuery } from "@/lib/audit-event-query"
import { prisma } from "@/lib/prisma"

type AuditSummaryDelegate = {
  count(args: unknown): Promise<number>
  groupBy?: (args: unknown) => Promise<Array<Record<string, unknown>>>
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>
}

function getDelegate(): AuditSummaryDelegate | undefined {
  return (prisma as typeof prisma & { auditEvent?: AuditSummaryDelegate }).auditEvent
}

export const GET = withAdminOnly(async (request: NextRequest, { admin }) => {
  const delegate = getDelegate()
  if (!delegate) return NextResponse.json({ error: "AuditEvent client is not generated" }, { status: 503 })
  const parsed = parseAuditEventQuery(new URL(request.url).searchParams)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const [total, failed, critical, sourceRows] = await Promise.all([
    delegate.count({ where: parsed.where }),
    delegate.count({ where: { ...parsed.where, status: "failed" } }),
    delegate.count({ where: { ...parsed.where, severity: "critical" } }),
    delegate.groupBy
      ? delegate.groupBy({ by: ["source"], where: parsed.where })
      : delegate.findMany({ where: parsed.where, select: { source: true }, distinct: ["source"], take: 100 }),
  ])
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "audit_events.summary.read",
    targetType: "audit_event_summary",
    metadata: { total, failed, critical, sourceCount: sourceRows.length },
  })
  return NextResponse.json({
    total,
    failed,
    critical,
    sourceCount: sourceRows.length,
    from: parsed.filters.range.from,
    to: parsed.filters.range.to,
  }, { headers: { "x-request-id": requestId } })
})

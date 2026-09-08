import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"

type AuditDelegate = {
  findUnique(args: unknown): Promise<Record<string, unknown> | null>
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>
}

function getDelegate(): AuditDelegate | undefined {
  return (prisma as typeof prisma & { auditEvent?: AuditDelegate }).auditEvent
}

export const GET = withAdminOnly(async (request: NextRequest, { admin, params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "Audit event id is required" }, { status: 400 })
  const delegate = getDelegate()
  if (!delegate) return NextResponse.json({ error: "AuditEvent client is not generated" }, { status: 503 })

  const event = await delegate.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: "Audit event not found" }, { status: 404 })
  const related = event.correlationId
    ? await delegate.findMany({
        where: { correlationId: event.correlationId },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        take: 200,
      })
    : []
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "audit_event.read",
    targetType: "audit_event",
    targetId: id,
    metadata: { relatedCount: related.length },
  })
  return NextResponse.json({ data: { event, related } }, { headers: { "x-request-id": requestId } })
})

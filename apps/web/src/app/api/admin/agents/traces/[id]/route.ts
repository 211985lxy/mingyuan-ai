import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"

function getTraceDelegate() {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: {
      findUnique(args: unknown): Promise<Record<string, unknown> | null>
    }
  }).aimExecutionTrace
}

export const GET = withAdminOnly(async (request: NextRequest, { admin, params }) => {
  const delegate = getTraceDelegate()
  if (!delegate) {
    return NextResponse.json({ error: "AimExecutionTrace client is not generated" }, { status: 503 })
  }

  const traceId = params?.id
  const trace = await delegate.findUnique({
    where: { id: traceId },
  })

  if (!trace) {
    return NextResponse.json({ error: "Trace not found" }, { status: 404 })
  }

  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "aim_agent_trace.read",
    targetType: "aim_execution_trace",
    targetId: typeof traceId === "string" ? traceId : undefined,
  })

  return NextResponse.json({ data: trace }, { headers: { "x-request-id": requestId } })
})

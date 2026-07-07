import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

function getTraceDelegate() {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: {
      findUnique(args: unknown): Promise<Record<string, unknown> | null>
    }
  }).aimExecutionTrace
}

export const GET = withAdminAuth(async (_request: NextRequest, { params }) => {
  const delegate = getTraceDelegate()
  if (!delegate) {
    return NextResponse.json({ error: "AimExecutionTrace client is not generated" }, { status: 503 })
  }

  const trace = await delegate.findUnique({
    where: { id: params?.id },
  })

  if (!trace) {
    return NextResponse.json({ error: "Trace not found" }, { status: 404 })
  }

  return NextResponse.json({ data: trace })
})

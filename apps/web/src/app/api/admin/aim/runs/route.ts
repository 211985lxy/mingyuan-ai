import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"

/**
 * Admin run list — strict admin auth.
 *
 * GET /api/admin/aim/runs?agentId=&qualityStatus=&degraded=&limit=&before=
 * Lists AimExecutionTrace rows with their harness long-term fields so the admin
 * console can filter by agent / quality status / degraded state and page back in
 * time. Only metadata is returned here; the full snapshot lives at
 * /api/admin/aim/runs/:runId.
 */

type ListDelegate = {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>
  count(args: unknown): Promise<number>
}

function getTraceDelegate(): ListDelegate | undefined {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: ListDelegate
  }).aimExecutionTrace
}

export const GET = withAdminOnly(async (request: NextRequest, { admin }) => {
  const delegate = getTraceDelegate()
  if (!delegate) {
    return NextResponse.json({ error: "AimExecutionTrace client is not generated" }, { status: 503 })
  }

  const url = new URL(request.url)
  const agentId = url.searchParams.get("agentId") || undefined
  const qualityStatus = url.searchParams.get("qualityStatus") || undefined
  const degradedParam = url.searchParams.get("degraded")
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200)
  const before = url.searchParams.get("before")

  const where: Record<string, unknown> = {}
  if (agentId) where.agentId = agentId
  if (qualityStatus) where.qualityStatus = qualityStatus
  if (degradedParam === "true") where.degraded = true
  if (before) {
    where.createdAt = { lt: new Date(before) }
  }
  // Only harness-instrumented runs carry a runId; filter so legacy rows don't
  // pollute the diagnostics view.
  where.runId = { not: null }

  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        runId: true,
        agentId: true,
        action: true,
        status: true,
        provider: true,
        model: true,
        fallbackIndex: true,
        degraded: true,
        harnessVersion: true,
        runtimeTask: true,
        conversationMode: true,
        knowledgeStrategy: true,
        promptHash: true,
        contextHash: true,
        qualityStatus: true,
        durationMs: true,
        totalTokens: true,
        createdAt: true,
      },
    }),
    delegate.count({ where }),
  ])

  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "aim_runs.read",
    targetType: "aim_execution_trace_list",
    metadata: { limit, resultCount: rows.length, total },
  })

  return NextResponse.json({ data: rows, total }, { headers: { "x-request-id": requestId } })
})

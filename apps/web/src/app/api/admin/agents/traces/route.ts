import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"

function getTraceDelegate() {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: {
      findMany(args: unknown): Promise<Array<Record<string, unknown>>>
      count(args: unknown): Promise<number>
      aggregate(args: unknown): Promise<{ _avg?: { durationMs?: number | null } }>
      groupBy(args: unknown): Promise<Array<Record<string, unknown>>>
    }
  }).aimExecutionTrace
}

function getRunEventDelegate() {
  return (prisma as typeof prisma & {
    aimRunEvent?: {
      groupBy(args: unknown): Promise<Array<{ event: string; _count: { _all: number } }>>
    }
  }).aimRunEvent
}

export const GET = withAdminOnly(async (request: NextRequest, { admin }) => {
  const delegate = getTraceDelegate()
  if (!delegate) {
    return NextResponse.json({ error: "AimExecutionTrace client is not generated" }, { status: 503 })
  }

  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)))
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const eventDelegate = getRunEventDelegate()

  const [traces, total24h, failed24h, success24h, avg, byAgent, byEvent] = await Promise.all([
    delegate.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        userId: true,
        projectId: true,
        agentId: true,
        action: true,
        status: true,
        durationMs: true,
        model: true,
        totalTokens: true,
        inputSummary: true,
        outputSummary: true,
        errorMessage: true,
        aimGenerationId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    delegate.count({ where: { createdAt: { gte: oneDayAgo } } }),
    delegate.count({ where: { createdAt: { gte: oneDayAgo }, status: "failed" } }),
    delegate.count({ where: { createdAt: { gte: oneDayAgo }, status: "success" } }),
    delegate.aggregate({
      where: { createdAt: { gte: oneDayAgo }, durationMs: { not: null } },
      _avg: { durationMs: true },
    }),
    delegate.groupBy({
      by: ["agentId", "status"],
      where: { createdAt: { gte: oneDayAgo } },
      _count: { _all: true },
    }),
    eventDelegate
      ? eventDelegate.groupBy({
          by: ["event"],
          where: { createdAt: { gte: oneDayAgo } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ])

  const eventCounts = Object.fromEntries(byEvent.map((row) => [row.event, row._count._all]))

  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "aim_agent_traces.read",
    targetType: "aim_execution_trace_list",
    metadata: { limit, resultCount: traces.length },
  })

  return NextResponse.json({
    data: {
      traces,
      stats: {
        total24h,
        failed24h,
        success24h,
        successRate24h: total24h > 0 ? Math.round((success24h / total24h) * 1000) / 10 : 0,
        averageDurationMs24h: Math.round(avg._avg?.durationMs || 0),
        copied24h: eventCounts.copied ?? 0,
        revised24h: eventCounts.revised ?? 0,
        accepted24h: eventCounts.accepted ?? 0,
        byAgent,
      },
    },
  }, { headers: { "x-request-id": requestId } })
})

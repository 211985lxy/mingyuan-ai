import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
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

export const GET = withAdminAuth(async (request: NextRequest) => {
  const delegate = getTraceDelegate()
  if (!delegate) {
    return NextResponse.json({ error: "AimExecutionTrace client is not generated" }, { status: 503 })
  }

  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)))
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [traces, total24h, failed24h, success24h, avg, byAgent] = await Promise.all([
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
  ])

  return NextResponse.json({
    data: {
      traces,
      stats: {
        total24h,
        failed24h,
        success24h,
        successRate24h: total24h > 0 ? Math.round((success24h / total24h) * 1000) / 10 : 0,
        averageDurationMs24h: Math.round(avg._avg?.durationMs || 0),
        byAgent,
      },
    },
  })
})

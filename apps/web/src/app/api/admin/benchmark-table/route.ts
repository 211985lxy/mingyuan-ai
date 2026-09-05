import { NextRequest, NextResponse } from "next/server"

import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { computeCrossCustomerBenchmark } from "@/lib/aim/benchmark-table"

export const dynamic = "force-dynamic"

const DEFAULT_WINDOW_DAYS = 90

/**
 * @description 跨客户基准表 v0（WP-E 对内）：内容任务 × 客户聚合的可追溯线索/成交基准
 * @param request - 查询参数 days（默认 90，7–365）
 * @returns JSON 聚合结果；活跃客户 <5 时 disclaimer 强制「仅内部参考，禁止对外」
 */
export const GET = withAdminOrEditor(async (request: NextRequest) => {
  const url = new URL(request.url)
  const rawDays = Number(url.searchParams.get("days")?.trim() || DEFAULT_WINDOW_DAYS)
  const windowDays = Number.isFinite(rawDays) ? Math.min(365, Math.max(7, Math.trunc(rawDays))) : DEFAULT_WINDOW_DAYS

  const end = new Date()
  const start = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000)

  const benchmark = await computeCrossCustomerBenchmark({
    start,
    end,
    windowDays,
    store: {
      aimGeneration: {
        findMany: async (args) =>
          prisma.aimGeneration.findMany({
            where: args?.where as never,
            select: { id: true, userId: true, workflowStatus: true, publishedAt: true, taskSpec: true },
            take: args?.take ?? 5000,
          }),
      },
      contentOutcome: {
        findMany: async (args) => {
          const rows = await prisma.contentOutcome.findMany({
            where: args?.where as never,
            select: {
              generationId: true,
              collectWindowDay: true,
              collectedAt: true,
              dealCount: true,
            },
            take: args?.take ?? 20000,
          })
          return rows.map((row) => ({
            ...row,
            views: null,
            qualifiedLeadCount: null,
            appointmentCount: null,
            revenue: null,
          }))
        },
      },
      outcomeAttribution: {
        findMany: async (args) =>
          prisma.outcomeAttribution.findMany({
            where: args?.where as never,
            select: { generationId: true, attributionMethod: true },
            take: args?.take ?? 20000,
          }),
      },
    },
  })

  return NextResponse.json({ benchmark })
})

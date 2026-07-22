import { NextResponse } from "next/server"
import { parseJsonBody } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { searchBodySchema } from "@/features/opportunities/contracts/api"
import { executeSearch } from "@/features/opportunities/services/search-orchestrator"

/**
 * POST /api/content-opportunities/search
 * 跨平台内容机会搜索（抖音 + 视频号）
 */
export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonBody(request, searchBodySchema, { maxBytes: 8 * 1024 })

  const result = await executeSearch({
    keyword: body.keyword,
    searchType: body.searchType,
    platforms: body.platforms,
    filters: body.filters,
    projectId: body.projectId,
    count: body.count,
    cursor: body.cursor,
  })

  // Persist search run (fire-and-forget style, but awaited for data integrity)
  const platformStatus: Record<string, string> = {}
  for (const pr of result.platformResults) {
    platformStatus[pr.platform] = pr.status
  }

  const overallStatus = result.platformResults.every((r) => r.status === "ok")
    ? "completed"
    : result.platformResults.some((r) => r.status === "ok")
      ? "partial"
      : "failed"

  try {
    await prisma.opportunitySearchRun.create({
      data: {
        userId: user.id,
        projectId: body.projectId || null,
        keyword: body.keyword,
        searchType: body.searchType,
        platforms: body.platforms,
        filters: (body.filters ?? {}) as object,
        status: overallStatus,
        platformStatus,
        resultCount: result.items.length,
      },
    })
  } catch {
    // Non-critical: search still works without persistence
  }

  return NextResponse.json({
    items: result.items,
    platformResults: result.platformResults.map((pr) => ({
      platform: pr.platform,
      status: pr.status,
      itemCount: pr.items.length,
      error: pr.error,
      durationMs: pr.durationMs,
    })),
    total: result.total,
    hasMore: result.hasMore,
    warnings: result.warnings,
  })
})

import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { normalizeControlCenterFilters } from "@/lib/control-center-contracts"
import { loadStatisticsOverview, parseStatisticsRange } from "@/lib/statistics-center"

export const dynamic = "force-dynamic"

export const GET = withAdminOnly(async (request: NextRequest, { admin }) => {
  const params = new URL(request.url).searchParams
  const range = parseStatisticsRange(params)
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 })
  const filters = normalizeControlCenterFilters({
    from: range.from,
    to: range.to,
    projectId: params.get("projectId"),
    agentId: params.get("agentId"),
    channel: params.get("channel"),
  })
  const rawHumanCost = Number(params.get("humanHourlyCostCny") || "0")
  if (!Number.isFinite(rawHumanCost) || rawHumanCost < 0 || rawHumanCost > 10_000) {
    return NextResponse.json({ error: "humanHourlyCostCny 不合法" }, { status: 400 })
  }
  const data = await loadStatisticsOverview({ range, filters, humanHourlyCostCny: rawHumanCost })
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "statistics.overview.read",
    targetType: "statistics_overview",
    metadata: { from: range.from, to: range.to, projectId: filters.projectId, channel: filters.channel },
  })
  return NextResponse.json({ data }, { headers: { "x-request-id": requestId } })
})

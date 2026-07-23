import { NextResponse } from "next/server"
import { parseJsonBody } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import { searchBodySchema } from "@/features/opportunities/contracts/api"
import { orchestrateSearch } from "@/features/opportunities/services/search-orchestrator"

/**
 * POST /api/content-opportunities/search
 * 跨平台内容搜索（RedFox 优先 → TikHub 兜底）
 */
export const POST = withUserAuth(async (request, { user: _user }) => {
  const body = await parseJsonBody(request, searchBodySchema, { maxBytes: 4 * 1024 })

  try {
    const result = await orchestrateSearch({
      keyword: body.keyword,
      platforms: body.platforms,
      count: body.count ?? 20,
      filters: body.filters,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "搜索失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

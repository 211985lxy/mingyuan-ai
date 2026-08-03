import { NextRequest, NextResponse } from "next/server"
import { getHotDecisions, refreshHotDecisions, type HotDecisionSource } from "@/lib/hot-decisions"
import { withUserAuth } from "@/lib/user-auth"

function parseSource(request: NextRequest): HotDecisionSource {
  const source = request.nextUrl.searchParams.get("source")
  if (source === "aihot" || source === "market") return source
  return "aihot"
}

/**
 * GET：公开读取热点决策（营销页/未登录可用）。
 */
export async function GET(request: NextRequest) {
  const data = await getHotDecisions(parseSource(request))
  return NextResponse.json({ data }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } })
}

/**
 * POST：刷新热点决策（会触发上游抓取，有成本/副作用）—— 需登录。
 * 未授权访问会返回 401，避免匿名滥用刷新接口。
 */
export const POST = withUserAuth(async (request) => {
  const data = await refreshHotDecisions(parseSource(request))
  return NextResponse.json({ data })
})

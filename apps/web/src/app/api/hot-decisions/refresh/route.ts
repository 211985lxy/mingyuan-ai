import { NextRequest, NextResponse } from "next/server"
import { refreshHotDecisions, type HotDecisionSource } from "@/lib/hot-decisions"
import { withUserAuth } from "@/lib/user-auth"

function parseSource(request: NextRequest): HotDecisionSource {
  const source = request.nextUrl.searchParams.get("source")
  if (source === "aihot" || source === "market") return source
  return "aihot"
}

/**
 * POST：刷新热点决策（会触发上游抓取，有成本/副作用）—— 需登录。
 */
export const POST = withUserAuth(async (request) => {
  const data = await refreshHotDecisions(parseSource(request))
  return NextResponse.json({ data })
})

import { NextRequest, NextResponse } from "next/server"
import { getHotDecisions, refreshHotDecisions, type HotDecisionSource } from "@/lib/hot-decisions"

function parseSource(request: NextRequest): HotDecisionSource {
  const source = request.nextUrl.searchParams.get("source")
  if (source === "aihot" || source === "market") return source
  return "aihot"
}

export async function GET(request: NextRequest) {
  const data = await getHotDecisions(parseSource(request))
  return NextResponse.json({ data }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } })
}

export async function POST(request: NextRequest) {
  const data = await refreshHotDecisions(parseSource(request))
  return NextResponse.json({ data })
}

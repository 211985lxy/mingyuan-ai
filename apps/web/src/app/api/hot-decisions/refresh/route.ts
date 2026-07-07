import { NextRequest, NextResponse } from "next/server"
import { refreshHotDecisions, type HotDecisionSource } from "@/lib/hot-decisions"

function parseSource(request: NextRequest): HotDecisionSource {
  const source = request.nextUrl.searchParams.get("source")
  if (source === "aihot" || source === "market") return source
  return "aihot"
}

export async function POST(request: NextRequest) {
  const data = await refreshHotDecisions(parseSource(request))
  return NextResponse.json({ data })
}

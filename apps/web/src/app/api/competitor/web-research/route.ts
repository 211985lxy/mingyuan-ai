import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"

import { runAgentReachCompetitorResearch } from "@/lib/competitor-research/agent-reach"
import { logger } from "@/lib/logger"
import { withUserAuth } from "@/lib/user-auth"
import { competitorResearchBodySchema } from "@/features/competitor/contracts/api"

export const runtime = "nodejs"
export const maxDuration = 30

export const POST = withUserAuth(async (request) => {
  const body = await parseJsonBody(request, competitorResearchBodySchema, { maxBytes: 4 * 1024 })

  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (!query) {
    return NextResponse.json({ error: "请输入要补证的关键词" }, { status: 400 })
  }

  try {
    const data = await runAgentReachCompetitorResearch(query)
    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "全网补证失败，请稍后重试"
    logger.error({ err: error, query }, "competitor web research route failed")
    return NextResponse.json({ error: message }, { status: 502 })
  }
}, { requireActivation: false })

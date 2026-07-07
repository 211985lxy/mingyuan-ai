import { NextRequest, NextResponse } from "next/server"

import { buildAgentCapabilities } from "@/lib/agent-api-contract"
import { agentAuthErrorResponse, authenticateAgentRequest } from "@/lib/agent-api-auth"

export async function GET(request: NextRequest) {
  try {
    await authenticateAgentRequest(request)
    return NextResponse.json(buildAgentCapabilities())
  } catch (error) {
    const authResponse = agentAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[agent/capabilities] Error:", error)
    return NextResponse.json({ error: "Failed to read capabilities" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { buildAgentCapabilities } from "@/lib/agent-api-contract"
import { agentAuthErrorResponse, authenticateAgentRequest, assertAgentScope } from "@/lib/agent-api-auth"
import { AGENT_SCOPE } from "@/lib/aim-remote/contracts"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateAgentRequest(request)
    assertAgentScope(context, AGENT_SCOPE.capabilitiesRead)
    return NextResponse.json(buildAgentCapabilities())
  } catch (error) {
    const authResponse = agentAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[agent/capabilities] Error:", error)
    return NextResponse.json({ error: "Failed to read capabilities" }, { status: 500 })
  }
}

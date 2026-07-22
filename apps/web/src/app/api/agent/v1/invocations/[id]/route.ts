import { NextRequest, NextResponse } from "next/server"
import { agentAuthErrorResponse, authenticateAgentRequest, assertAgentScope } from "@/lib/agent-api-auth"
import { isRemoteInvocationsEnabled } from "@/lib/aim-remote/feature-flags"
import { getInvocation } from "@/lib/aim-remote/invocation-service"
import { AGENT_SCOPE, REMOTE_ERROR_CODE, remoteErrorStatus } from "@/lib/aim-remote/contracts"

/**
 * @description 处理 GET 请求 — 查询调用排队/运行/结果/错误与 Token 成本
 * @param request - 请求对象
 * @param params - 路由参数 { id }
 * @returns 无返回值
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isRemoteInvocationsEnabled()) {
    return NextResponse.json({ error: "Remote invocations are disabled", code: REMOTE_ERROR_CODE.REMOTE_FEATURE_DISABLED }, { status: 503 })
  }
  try {
    const context = await authenticateAgentRequest(request)
    assertAgentScope(context, AGENT_SCOPE.invocationsRead)
    const { id } = await params

    const response = await getInvocation(context, id)
    if (!response) {
      return NextResponse.json({ error: "Invocation not found", code: REMOTE_ERROR_CODE.INVOCATION_NOT_FOUND }, { status: remoteErrorStatus(REMOTE_ERROR_CODE.INVOCATION_NOT_FOUND) })
    }
    return NextResponse.json(response)
  } catch (error) {
    return agentAuthErrorResponse(error)
      ?? NextResponse.json({ error: "Invocation lookup failed" }, { status: 500 })
  }
}

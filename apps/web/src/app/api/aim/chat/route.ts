import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { failAimTrace } from "@/lib/aim-observability"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { mapAimErrorToUserMessage } from "@/lib/aim-error-message"
import { runSignedInAimChat, type SignedInChatState } from "@/lib/aim/services/signed-in-chat"

/** 流式对话可能较长；与 Nginx /api proxy_read_timeout(300s) 对齐 */
export const maxDuration = 180
const AIM_CHAT_MAX_REQUEST_BYTES = 128 * 1024

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  const state: SignedInChatState = {}
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_chat")
    if (quotaResponse) return quotaResponse
    const body = await parseJsonRecord(request, { maxBytes: AIM_CHAT_MAX_REQUEST_BYTES })
    return await runSignedInAimChat({ userId: user.id, body, state })
  } catch (error) {
    return respondToChatFailure(request, state, error)
  }
}

async function respondToChatFailure(request: NextRequest, state: SignedInChatState, error: unknown) {
  const authResponse = authErrorResponse(error)
  if (authResponse) return authResponse
  const contractResponse = apiRequestErrorResponse(request, error)
  if (contractResponse) return contractResponse

  console.error("[aim/chat] Error:", error)
  await failAimTrace(state.trace, error)
  return NextResponse.json(
    { error: mapAimErrorToUserMessage(error, "对话失败，请稍后重试") },
    { status: 500 },
  )
}

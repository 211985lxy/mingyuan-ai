import { NextRequest, NextResponse } from "next/server"

import { allowAuthAttempt } from "@/features/auth/auth-rate-limit"
import {
  completeDouyinPhoneLogin,
  DouyinLoginFlowError,
} from "@/features/auth/douyin-login"
import { douyinCompleteBodySchema } from "@/features/auth/contracts"
import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { buildAuthUserPayload } from "@/lib/auth-user"
import { env } from "@/env"
import { setSessionCookie } from "@/lib/auth-session"
import { signUserToken } from "@/lib/user-auth"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  let input
  try {
    input = await parseJsonBody(request, douyinCompleteBodySchema, { maxBytes: 4096 })
  } catch (error) {
    return apiRequestErrorResponse(request, error) ?? NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const challengeId = request.cookies.get("douyin_login_challenge")?.value
  if (!challengeId) {
    return NextResponse.json(
      { error: "抖音登录已过期，请重新扫码", code: "CHALLENGE_INVALID" },
      { status: 401 },
    )
  }

  if (!await allowAuthAttempt("douyin-login-complete", request, input.phone, { limit: 8, windowSeconds: 15 * 60 })) {
    return NextResponse.json(
      { error: "尝试次数过多，请 15 分钟后再试", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "900" } },
    )
  }

  try {
    const user = await completeDouyinPhoneLogin({
      challengeId,
      phone: input.phone,
      code: input.code,
    })
    const response = NextResponse.json({ user: buildAuthUserPayload(user) })
    setSessionCookie(response, "user", signUserToken({ id: user.id, email: user.email }))
    response.cookies.set("douyin_login_challenge", "", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    })
    return response
  } catch (error) {
    if (error instanceof DouyinLoginFlowError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error("[douyin-login-complete] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "登录暂时失败，请稍后重试" }, { status: 503 })
  }
}

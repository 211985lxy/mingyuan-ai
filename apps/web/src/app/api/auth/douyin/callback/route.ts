import { NextRequest, NextResponse } from "next/server"

import { createDouyinLoginChallenge } from "@/features/auth/douyin-login"
import {
  exchangeDouyinCodeForToken,
  type DouyinToken,
} from "@/lib/douyin-openapi"
import { env } from "@/env"
import { setSessionCookie } from "@/lib/auth-session"
import { signUserToken } from "@/lib/user-auth"
import { getSubscriptionStatus } from "@/lib/subscription"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const STATE_COOKIE = "douyin_login_state"
const CHALLENGE_COOKIE = "douyin_login_challenge"
const COOKIE_MAX_AGE = 10 * 60

export async function GET(request: NextRequest) {
  const login = new URL("/login", request.url)
  const params = request.nextUrl.searchParams
  const code = params.get("code")
  const state = params.get("state")
  const error = params.get("error") || params.get("error_code") || params.get("errorCode")

  if (error || !code || !state) {
    return redirectToLogin(login, error ? "抖音授权未完成，请重试" : "抖音未返回有效授权码，请重试")
  }

  const savedState = request.cookies.get(STATE_COOKIE)?.value
  if (!savedState || savedState !== state) {
    return redirectToLogin(login, "授权状态校验失败，请从登录页重新扫码")
  }

  let token: DouyinToken | null = null
  try {
    token = await exchangeDouyinCodeForToken(code)
    if (!token) return redirectToLogin(login, "抖音授权凭证无效，请重试")

    const identity = await prisma.douyinLoginIdentity.findUnique({
      where: { openId: token.openId },
    })

    if (identity) {
      const user = await prisma.user.findUnique({ where: { id: identity.userId } })
      if (!user) return redirectToLogin(login, "抖音绑定账号已不存在，请联系管理员")

      const destination = new URL(
        getSubscriptionStatus(user.expiresAt) === "active" ? "/lite" : "/activate",
        request.url,
      )
      const response = NextResponse.redirect(destination, { status: 302 })
      setSessionCookie(response, "user", signUserToken({ id: user.id, email: user.email }))
      clearTransientCookies(response)
      return response
    }

    const challengeId = await createDouyinLoginChallenge({
      state,
      openId: token.openId,
      unionId: token.unionId,
      scope: token.scope || "user_info",
    })
    login.searchParams.set("douyin", "bind")
    const response = NextResponse.redirect(login, { status: 302 })
    response.cookies.set(CHALLENGE_COOKIE, challengeId, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    })
    response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 })
    return response
  } catch (err) {
    console.error("[douyin-login-callback] failed:", err instanceof Error ? err.message : err)
    return redirectToLogin(login, "抖音扫码登录暂时失败，请稍后重试")
  }
}

function redirectToLogin(login: URL, message: string): NextResponse {
  login.searchParams.set("douyin_error", message)
  const response = NextResponse.redirect(login, { status: 302 })
  clearTransientCookies(response)
  return response
}

function clearTransientCookies(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 })
  response.cookies.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 })
}

import { randomBytes } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { buildDouyinLoginAuthorizationUrl } from "@/lib/douyin-openapi"
import { env } from "@/env"
import { getRequestOrigin } from "@/lib/auth-session"

export const runtime = "nodejs"

const STATE_COOKIE = "douyin_login_state"
const COOKIE_MAX_AGE = 10 * 60

export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(16).toString("hex")
    const response = NextResponse.redirect(buildDouyinLoginAuthorizationUrl(state), { status: 302 })
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    })
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "抖音扫码登录暂不可用"
    const login = new URL("/login", getRequestOrigin(request))
    login.searchParams.set("douyin_error", message)
    return NextResponse.redirect(login, { status: 302 })
  }
}

import { randomBytes } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { buildDouyinAuthorizationUrl } from "@/lib/douyin-openapi"
import { resolveBoundProject } from "@/lib/account-project-context"
import {
  DEFAULT_DOUYIN_RETURN_PATH,
  DOUYIN_RETURN_COOKIE,
  sanitizeLocalPath,
} from "@/lib/douyin-oauth-return"

export const runtime = "nodejs"

const OAUTH_COOKIE_MAX_AGE = 10 * 60 // 10 分钟，和抖音 code 的有效期一致

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  }
}

/**
 * 发起抖音扫码授权流程。
 * - 生成 16 字节随机 state（防 CSRF），与回跳路径一并以 HttpOnly Cookie 暂存
 * - 回跳路径来自 ?return=，经站内路径校验后写入，非法则落到默认页
 * - 302 跳转到抖音官方扫码展示页
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    await resolveBoundProject({ userId: user.id })
  } catch (err) {
    return authErrorResponse(err)
  }

  const returnPath =
    sanitizeLocalPath(request.nextUrl.searchParams.get("return")) ?? DEFAULT_DOUYIN_RETURN_PATH

  try {
    const state = randomBytes(16).toString("hex")
    const authUrl = buildDouyinAuthorizationUrl(state)
    const response = NextResponse.redirect(authUrl, { status: 302 })
    response.cookies.set("douyin_oauth_state", state, oauthCookieOptions())
    response.cookies.set(DOUYIN_RETURN_COOKIE, returnPath, oauthCookieOptions())
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "抖音授权发起失败"
    // 跳回发起页并带错误参数，前端展示提示
    const redirect = new URL(returnPath, request.nextUrl.origin)
    redirect.searchParams.set("douyin_error", encodeURIComponent(message))
    return NextResponse.redirect(redirect, { status: 302 })
  }
}

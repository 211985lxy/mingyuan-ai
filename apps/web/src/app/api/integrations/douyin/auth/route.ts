import { randomBytes } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { buildDouyinAuthorizationUrl } from "@/lib/douyin-openapi"

export const runtime = "nodejs"

/**
 * 发起抖音扫码授权流程。
 * - 生成 16 字节随机 state（防 CSRF）
 * - 写入 HttpOnly + Secure + SameSite=Lax Cookie，有效期 10 分钟
 * - 302 跳转到抖音官方扫码展示页
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request)
  } catch (err) {
    return authErrorResponse(err)
  }

  let authUrl: string
  try {
    const state = randomBytes(16).toString("hex")
    authUrl = buildDouyinAuthorizationUrl(state)
    const response = NextResponse.redirect(authUrl, { status: 302 })
    response.cookies.set("douyin_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60, // 10 分钟，和抖音 code 的有效期一致
    })
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "抖音授权发起失败"
    // 带错误参数跳回 Dashboard，前端展示提示
    const redirect = new URL("/home", request.nextUrl.origin)
    redirect.searchParams.set("douyin_error", encodeURIComponent(message))
    return NextResponse.redirect(redirect, { status: 302 })
  }
}

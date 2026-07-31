import { NextRequest, NextResponse } from "next/server"

import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import {
  exchangeDouyinCodeForToken,
  fetchDouyinFansProfile,
  fetchDouyinRecentVideos,
  fetchDouyinUserProfile,
  syncDouyinDataToLarkBase,
  type DouyinToken,
} from "@/lib/douyin-openapi"
import { env } from "@/env"

export const runtime = "nodejs"

/**
 * 抖音授权回调。
 * 流程：校验 state（防 CSRF）→ code 换 token → 拉用户/视频/粉丝数据
 *         → 写入飞书 Base → 302 回 Dashboard（带上结果状态）
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request)
  } catch (err) {
    return authErrorResponse(err)
  }

  const origin = request.nextUrl.origin
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error") || searchParams.get("errorCode") || searchParams.get("error_code")
  const errorMsg = searchParams.get("error_description") || searchParams.get("description") || "用户取消授权"

  const homeRedirect = new URL("/home", origin)

  /* 1. 抖音返回错误（用户拒绝、超时、scope 不足） */
  if (error || !code) {
    homeRedirect.searchParams.set(
      "douyin_error",
      encodeURIComponent(error ? `抖音授权失败：${error} ${errorMsg}`.trim() : "抖音未返回授权 code，请重试。"),
    )
    return NextResponse.redirect(homeRedirect, { status: 302 })
  }

  /* 2. state 校验（和 Cookie 里保存的一致） */
  const savedState = request.cookies.get("douyin_oauth_state")?.value
  if (!savedState || savedState !== state) {
    homeRedirect.searchParams.set("douyin_error", encodeURIComponent("授权状态校验失败（CSRF），请重新发起绑定。"))
    const r = NextResponse.redirect(homeRedirect, { status: 302 })
    r.cookies.delete("douyin_oauth_state")
    return r
  }

  let token: DouyinToken | null = null

  try {
    /* 3. code 换 access_token / open_id */
    token = await exchangeDouyinCodeForToken(code)
    if (!token) {
      throw new Error("授权码（code）换令牌失败，请确认抖音后台回调地址与 DOUYIN_REDIRECT_URI 完全一致。")
    }

    /* 4. 并行拉取：用户信息、最近 20 条视频、粉丝画像 */
    const [profile, videos] = await Promise.all([
      fetchDouyinUserProfile(token),
      fetchDouyinRecentVideos(token, 20),
      fetchDouyinFansProfile(token).catch(() => null), // 没申请到 profile scope 忽略
    ])
    if (!profile) {
      throw new Error("抖音用户信息读取失败，可能是 user_info scope 未审核通过。")
    }

    /* 5. 写入飞书 Base（账号表 + 视频数据表） */
    let syncResult: { accounts: number; videos: number; fansWritten: boolean } | null = null
    if (env.LARK_PLATFORM_DATA_BASE_TOKEN) {
      syncResult = await syncDouyinDataToLarkBase({ profile, videos, token })
    }

    /* 6. 回跳 Dashboard + 成功状态参数 */
    homeRedirect.searchParams.set("douyin_ok", "1")
    homeRedirect.searchParams.set("nickname", encodeURIComponent(profile.nickname))
    homeRedirect.searchParams.set("fans", String(profile.followers ?? 0))
    homeRedirect.searchParams.set("videos_count", String(videos.length))
    if (syncResult) {
      homeRedirect.searchParams.set("lark_accounts", String(syncResult.accounts))
      homeRedirect.searchParams.set("lark_videos", String(syncResult.videos))
    }
    const resp = NextResponse.redirect(homeRedirect, { status: 302 })
    resp.cookies.delete("douyin_oauth_state")
    return resp
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[douyin-callback] 失败:", message)
    homeRedirect.searchParams.set("douyin_error", encodeURIComponent(message))
    const resp = NextResponse.redirect(homeRedirect, { status: 302 })
    resp.cookies.delete("douyin_oauth_state")
    return resp
  }
}

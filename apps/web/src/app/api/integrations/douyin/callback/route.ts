import { NextRequest, NextResponse } from "next/server"

import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import {
  exchangeDouyinCodeForToken,
  fetchDouyinFansProfile,
  fetchDouyinUserProfile,
  syncDouyinDataToLarkBase,
} from "@/lib/douyin-openapi"
import { env } from "@/env"
import {
  claimDouyinLoginIdentity,
  upsertDouyinBinding,
} from "@/features/integrations/douyin-binding"
import { resolveBoundProject } from "@/lib/account-project-context"
import { DOUYIN_RETURN_COOKIE, readDouyinReturnPath } from "@/lib/douyin-oauth-return"

export const runtime = "nodejs"

/**
 * 抖音授权回调。
 * 流程：校验 state（防 CSRF）→ code 换 token → 拉用户/视频/粉丝数据
 *         → 写入飞书 Base → 302 回发起页（带上结果状态）
 * 回跳目标取自发起授权时写入的 douyin_oauth_return Cookie，用户在哪发起就回哪，
 * 保证该页的提示组件能读到 douyin_ok / douyin_error。
 */
export async function GET(request: NextRequest) {
  let auth: { id: string; email: string }
  // 归属项目：写入飞书时打标，使自有数据只对该项目可见（见 row-ownership.ts）
  let projectId = ""
  try {
    auth = await authenticateRequest(request)
    projectId = (await resolveBoundProject({ userId: auth.id })).id
  } catch (err) {
    return authErrorResponse(err)
  }

  const origin = request.nextUrl.origin
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error") || searchParams.get("errorCode") || searchParams.get("error_code")
  const errorMsg = searchParams.get("error_description") || searchParams.get("description") || "用户取消授权"

  const resultRedirect = new URL(readDouyinReturnPath(request), origin)

  /* 1. 抖音返回错误（用户拒绝、超时、scope 不足） */
  if (error || !code) {
    resultRedirect.searchParams.set(
      "douyin_error",
      encodeURIComponent(error ? `抖音授权失败：${error} ${errorMsg}`.trim() : "抖音未返回授权 code，请重试。"),
    )
    return NextResponse.redirect(resultRedirect, { status: 302 })
  }

  /* 2. state 校验（和 Cookie 里保存的一致） */
  const savedState = request.cookies.get("douyin_oauth_state")?.value
  if (!savedState || savedState !== state) {
    resultRedirect.searchParams.set("douyin_error", encodeURIComponent("授权状态校验失败（CSRF），请重新发起绑定。"))
    const r = NextResponse.redirect(resultRedirect, { status: 302 })
    r.cookies.delete("douyin_oauth_state")
    r.cookies.delete(DOUYIN_RETURN_COOKIE)
    return r
  }

  try {
    /* 3. code 换 access_token / open_id */
    const token = await exchangeDouyinCodeForToken(code)
    if (!token) {
      throw new Error("授权码（code）换令牌失败，请确认抖音后台回调地址与 DOUYIN_REDIRECT_URI 完全一致。")
    }

    /* 4. 并行拉取：用户信息、粉丝画像
     *
     * 作品列表**不在此处拉取**：抖音开放平台的「授权账号作品列表」能力已下线
     * （实测错误码 28001056），而第三方通道需要 sec_user_id——它由用户在绑定后
     * 粘贴一次主页链接获得。此前这里调用已下线接口，结果作品表恒为空却仍报成功
     * （静默失败）；现改为如实告知下一步。 */
    const [profile, fans] = await Promise.all([
      fetchDouyinUserProfile(token),
      fetchDouyinFansProfile(token).catch(() => null), // 未获批 fans.data.bind 时为 null
    ])
    if (!profile) {
      throw new Error("抖音用户信息读取失败，可能是 user_info scope 未审核通过。")
    }

    /* 4.5 绑定关系落库（AIM 侧持久化，供后续免扫码读取/刷新） */
    await claimDouyinLoginIdentity(auth.id, token)
    await upsertDouyinBinding({ userId: auth.id, token, profile })

    /* 5. 写入飞书 Base（账号表 + 粉丝画像；作品表待补主页链接后由每日同步写入） */
    let syncResult: { accounts: number; videos: number; fansWritten: boolean } | null = null
    if (env.LARK_PLATFORM_DATA_BASE_TOKEN) {
      syncResult = await syncDouyinDataToLarkBase({ profile, videos: [], token, fans, projectId })
    }

    applySuccessParams(resultRedirect, profile, 0, syncResult, true)
    return redirectWithOauthCookiesCleared(resultRedirect)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[douyin-callback] 失败:", message)
    resultRedirect.searchParams.set("douyin_error", encodeURIComponent(message))
    return redirectWithOauthCookiesCleared(resultRedirect)
  }
}

function applySuccessParams(
  resultRedirect: URL,
  profile: { nickname: string; followers?: number | null },
  videoCount: number,
  syncResult: { accounts: number; videos: number } | null,
  worksPendingProfileLink = false,
) {
  resultRedirect.searchParams.set("douyin_ok", "1")
  resultRedirect.searchParams.set("nickname", encodeURIComponent(profile.nickname))
  resultRedirect.searchParams.set("fans", String(profile.followers ?? 0))
  resultRedirect.searchParams.set("videos_count", String(videoCount))
  // 作品数据待补主页链接（前端据此提示「补充主页链接」，而不是让用户以为同步了 0 条）
  if (worksPendingProfileLink) resultRedirect.searchParams.set("works_pending_link", "1")
  if (syncResult) {
    resultRedirect.searchParams.set("lark_accounts", String(syncResult.accounts))
    resultRedirect.searchParams.set("lark_videos", String(syncResult.videos))
  }
}

function redirectWithOauthCookiesCleared(target: URL) {
  const resp = NextResponse.redirect(target, { status: 302 })
  resp.cookies.delete("douyin_oauth_state")
  resp.cookies.delete(DOUYIN_RETURN_COOKIE)
  return resp
}

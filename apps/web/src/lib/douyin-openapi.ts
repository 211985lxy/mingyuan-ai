/**
 * 抖音开放平台 OAuth2.0 + 业务数据接口封装。
 * 接入前提（developer.open-douyin.com 注册「网站应用」）：
 *  - DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET / DOUYIN_REDIRECT_URI / DOUYIN_DEFAULT_SCOPE
 * 设计原则：真实响应优先、不造假；第三方路径常量集中；敏感字段禁日志。
 */
import { env } from "@/env"

/* ===== 常量与基础类型 ===== */
const DOUYIN_OPEN_HOST = "https://open.douyin.com"
/** PC 端扫码授权页（展示二维码给用户扫） */
const DOUYIN_CONNECT_URL = `${DOUYIN_OPEN_HOST}/platform/oauth/connect`
/** code 换 access_token */
const DOUYIN_TOKEN_URL = `${DOUYIN_OPEN_HOST}/oauth/access_token/`

/** refresh_token 续期 */
const DOUYIN_REFRESH_URL = `${DOUYIN_OPEN_HOST}/oauth/refresh_token/`

/** 用户公开信息（昵称、头像、粉丝数等基础字段） */
const DOUYIN_USERINFO_URL = `${DOUYIN_OPEN_HOST}/oauth/userinfo/`

/** 视频列表（含互动指标：点赞、评论、分享、收藏）。scope: video.list */
const DOUYIN_VIDEO_LIST_URL = `${DOUYIN_OPEN_HOST}/api/douyin/v1/video/list/`

/** 粉丝画像数据（性别/年龄/地域/活跃/设备分布）。scope: fans.data.bind */
const DOUYIN_FANS_PROFILE_URL = `${DOUYIN_OPEN_HOST}/api/douyin/v1/user/fans_data/`

/** 默认申请的权限——覆盖账号信息 + 视频列表 + 粉丝画像 */
const DEFAULT_SCOPE = "user_info,video.list,fans.data.bind"

export type DouyinToken = {
  accessToken: string
  refreshToken: string
  openId: string
  unionId?: string | null
  expiresIn: number
  scope: string
}

export type DouyinUserProfile = {
  openId: string
  unionId?: string | null
  nickname: string
  avatar: string
  followers?: number | null
  following?: number | null
  awemeCount?: number | null
  totalFavorited?: number | null
  signature?: string | null
  gender?: number | null
  country?: string | null
  province?: string | null
  city?: string | null
}

export type DouyinVideo = {
  itemId: string
  title: string
  coverUrl?: string | null
  shareUrl?: string | null
  videoId?: string | null
  mediaType?: string | null
  createTime?: number | null
  statistics?: {
    commentCount?: number
    diggCount?: number
    downloadCount?: number
    playCount?: number
    shareCount?: number
    forwardCount?: number
    loseCount?: number
    loseCommentCount?: number
    collectCount?: number
  } | null
}

/** 粉丝分布项：官方返回 { item, value }（value 为该维度的占比） */
export type DouyinDistributionItem = { value: string; percent: number }

/**
 * 粉丝画像。
 * 对应能力「粉丝画像数据」（scope `fans.data.bind`）。
 * 粉丝来源、粉丝喜好属另外两个能力（`data.external.fans_source` / `data.external.fans_favourite`），不在本类型内。
 */
export type DouyinFansProfile = {
  /** 分性别比例 */
  gender?: DouyinDistributionItem[] | null
  /** 分年龄段比例 */
  ages?: DouyinDistributionItem[] | null
  /** 分地域（省/城市）比例 */
  provinces?: DouyinDistributionItem[] | null
  /** 粉丝兴趣分布 */
  interests?: DouyinDistributionItem[] | null
  /** 活跃天数分布 */
  activeDays?: DouyinDistributionItem[] | null
  /** 设备分布 */
  devices?: DouyinDistributionItem[] | null
  /** 粉丝总数 */
  allFansNum?: number | null
}

/* =========================================================
   工具
   ========================================================= */

function ensureConfig() {
  const clientKey = env.DOUYIN_CLIENT_KEY?.trim()
  const clientSecret = env.DOUYIN_CLIENT_SECRET?.trim()
  const redirectUri = env.DOUYIN_REDIRECT_URI?.trim()
  const scope = env.DOUYIN_DEFAULT_SCOPE?.trim() || DEFAULT_SCOPE
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error(
      "抖音开放平台环境变量未配置，请检查 DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET / DOUYIN_REDIRECT_URI。",
    )
  }
  return { clientKey, clientSecret, redirectUri, scope }
}

function ensureLoginConfig() {
  const clientKey = env.DOUYIN_CLIENT_KEY?.trim()
  const redirectUri = env.DOUYIN_LOGIN_REDIRECT_URI?.trim()
  if (!clientKey || !redirectUri) {
    throw new Error(
      "抖音扫码登录环境变量未配置，请检查 DOUYIN_CLIENT_KEY / DOUYIN_LOGIN_REDIRECT_URI。",
    )
  }
  return { clientKey, redirectUri }
}

async function safeFetchJson<T>(url: string, init?: RequestInit, label?: string): Promise<T | null> {
  try {
    const resp = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    })
    const text = await resp.text()
    if (!resp.ok) {
      console.warn(`[douyin-openapi] ${label ?? url} HTTP ${resp.status}: ${text.slice(0, 300)}`)
      return null
    }
    if (!text) return null
    try {
      return JSON.parse(text) as T
    } catch {
      console.warn(`[douyin-openapi] ${label ?? url} JSON 解析失败: ${text.slice(0, 200)}`)
      return null
    }
  } catch (err) {
    console.warn(`[douyin-openapi] ${label ?? url} 请求失败:`, err instanceof Error ? err.message : err)
    return null
  }
}

/* =========================================================
   OAuth 流程
   ========================================================= */

/**
 * 构造 PC 端抖音扫码授权 URL。
 * 用户跳转到这个地址后，会看到抖音的授权二维码，用抖音 App 扫码即可完成授权。
 */
export function buildDouyinAuthorizationUrl(state: string): string {
  const { clientKey, redirectUri, scope } = ensureConfig()
  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    scope,
    state,
    response_type: "code",
    // 官方推荐 PC 端使用 qrcode 模式优先展示二维码
    from: "openapi",
  })
  return `${DOUYIN_CONNECT_URL}?${params.toString()}`
}

/** 构造只申请 user_info 的抖音扫码登录地址；与数据同步授权完全分离。 */
export function buildDouyinLoginAuthorizationUrl(state: string): string {
  const { clientKey, redirectUri } = ensureLoginConfig()
  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    scope: "user_info",
    state,
    response_type: "code",
    from: "openapi",
  })
  return `${DOUYIN_CONNECT_URL}?${params.toString()}`
}

/**
 * 用授权回调里的 code 换 access_token / open_id / refresh_token。
 * 抖音官方文档：code 10分钟有效，只能用一次。
 */
export async function exchangeDouyinCodeForToken(code: string): Promise<DouyinToken | null> {
  const { clientKey, clientSecret } = ensureConfig()
  const payload = await safeFetchJson<{
    data?: {
      access_token?: string
      refresh_token?: string
      open_id?: string
      union_id?: string
      expires_in?: number
      scope?: string
      error_code?: number
      description?: string
    }
    message?: string
  }>(
    `${DOUYIN_TOKEN_URL}?${new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }).toString()}`,
    undefined,
    "exchange-code",
  )

  const data = payload?.data
  if (!data?.access_token || !data?.open_id) {
    console.warn("[douyin-openapi] code 换 token 失败:", data?.description || payload?.message || "data.access_token 为空")
    return null
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    openId: data.open_id,
    unionId: data.union_id || null,
    expiresIn: data.expires_in ?? 15 * 24 * 60 * 60, // 默认 15 天
    scope: data.scope || "",
  }
}

/** 刷新 access_token。refresh_token 有效期 30 天，最多续到首次授权后 195 天。 */
export async function refreshDouyinAccessToken(refreshToken: string): Promise<DouyinToken | null> {
  const { clientKey } = ensureConfig()
  const payload = await safeFetchJson<{
    data?: {
      access_token?: string
      refresh_token?: string
      open_id?: string
      union_id?: string
      expires_in?: number
      scope?: string
    }
  }>(
    `${DOUYIN_REFRESH_URL}?${new URLSearchParams({
      client_key: clientKey,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString()}`,
    undefined,
    "refresh-token",
  )
  const data = payload?.data
  if (!data?.access_token || !data?.open_id) return null
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    openId: data.open_id,
    unionId: data.union_id || null,
    expiresIn: data.expires_in ?? 15 * 24 * 60 * 60,
    scope: data.scope || "",
  }
}

/* =========================================================
   业务数据接口
   ========================================================= */

/**
 * 获取用户公开信息 + 基础账号指标。
 * 对应 scope: user_info。真实字段取决于申请到的权限，取不到即 null。
 */
export async function fetchDouyinUserProfile(token: DouyinToken): Promise<DouyinUserProfile | null> {
  const payload = await safeFetchJson<{
    data?: {
      open_id?: string
      union_id?: string
      nickname?: string
      avatar?: string
      avatar_larger?: string
      followers?: number
      following?: number
      aweme_count?: number
      total_favorited?: number
      signature?: string
      gender?: number
      country?: string
      province?: string
      city?: string
      error_code?: number
      description?: string
    }
  }>(
    `${DOUYIN_USERINFO_URL}?${new URLSearchParams({
      access_token: token.accessToken,
      open_id: token.openId,
    }).toString()}`,
    undefined,
    "userinfo",
  )
  const d = payload?.data
  if (!d) return null
  return {
    openId: d.open_id || token.openId,
    unionId: d.union_id || token.unionId || null,
    nickname: d.nickname || "抖音用户",
    avatar: d.avatar_larger || d.avatar || "",
    followers: typeof d.followers === "number" ? d.followers : null,
    following: typeof d.following === "number" ? d.following : null,
    awemeCount: typeof d.aweme_count === "number" ? d.aweme_count : null,
    totalFavorited: typeof d.total_favorited === "number" ? d.total_favorited : null,
    signature: d.signature || null,
    gender: typeof d.gender === "number" ? d.gender : null,
    country: d.country || null,
    province: d.province || null,
    city: d.city || null,
  }
}

/**
 * 分页拉取最近的视频列表（默认拉取最近 50 条）。
 * 对应 scope: video.list
 */
export async function fetchDouyinRecentVideos(
  token: DouyinToken,
  max = 50,
): Promise<DouyinVideo[]> {
  const results: DouyinVideo[] = []
  let cursor = 0
  const pageSize = Math.min(max, 20)
  const pages = Math.ceil(max / pageSize)

  for (let i = 0; i < pages; i++) {
    const payload = await safeFetchJson<{
      data?: {
        list?: Array<{
          item_id?: string
          title?: string
          cover?: { url_list?: string[] }
          share_url?: string
          video_id?: string
          media_type?: string
          create_time?: number
          statistics?: {
            comment_count?: number
            digg_count?: number
            download_count?: number
            play_count?: number
            share_count?: number
            forward_count?: number
            lose_count?: number
            lose_comment_count?: number
            collect_count?: number
          }
        }>
        has_more?: boolean
        cursor?: number
        error_code?: number
        description?: string
      }
    }>(
      `${DOUYIN_VIDEO_LIST_URL}?${new URLSearchParams({
        open_id: token.openId,
        access_token: token.accessToken,
        cursor: String(cursor),
        count: String(pageSize),
      }).toString()}`,
      undefined,
      `video-list-${i + 1}`,
    )
    const items = payload?.data?.list || []
    for (const item of items) {
      if (!item?.item_id) continue
      results.push({
        itemId: item.item_id,
        title: item.title || "未命名视频",
        coverUrl: item.cover?.url_list?.[0] || null,
        shareUrl: item.share_url || null,
        videoId: item.video_id || null,
        mediaType: item.media_type || null,
        createTime: typeof item.create_time === "number" ? item.create_time : null,
        statistics: item.statistics
          ? {
              commentCount: item.statistics.comment_count,
              diggCount: item.statistics.digg_count,
              downloadCount: item.statistics.download_count,
              playCount: item.statistics.play_count,
              shareCount: item.statistics.share_count,
              forwardCount: item.statistics.forward_count,
              loseCount: item.statistics.lose_count,
              loseCommentCount: item.statistics.lose_comment_count,
              collectCount: item.statistics.collect_count,
            }
          : null,
      })
    }
    if (!payload?.data?.has_more) break
    cursor = payload.data.cursor ?? cursor + pageSize
  }

  return results
}

/** 官方 /user/fans_data/ 的响应结构（见 docs: get-user-fans-data） */
type DouyinFansDistribution = Array<{ item?: string; value?: number }>

type DouyinFansDataPayload = {
  data?: {
    fans_data?: {
      gender_distributions?: DouyinFansDistribution
      age_distributions?: DouyinFansDistribution
      geographical_distributions?: DouyinFansDistribution
      interest_distributions?: DouyinFansDistribution
      active_days_distributions?: DouyinFansDistribution
      device_distributions?: DouyinFansDistribution
      all_fans_num?: number
    }
    error_code?: number | string
    description?: string
  }
}

/** 把官方的 { item, value } 分布数组转成 { value, percent }。 */
function toDistribution(items?: DouyinFansDistribution): DouyinDistributionItem[] | null {
  if (!Array.isArray(items) || items.length === 0) return null
  return items.map((x) => ({
    value: x.item || "未知",
    percent: typeof x.value === "number" ? Number(x.value.toFixed(4)) : 0,
  }))
}

/**
 * 粉丝画像：性别/年龄/地域/兴趣/活跃/设备分布。
 * 官方接口 /api/douyin/v1/user/fans_data/，scope: fans.data.bind；未申请到该能力时返回 null。
 * 数据约束：仅粉丝数 > 100 的账号有数据，且首次授权后需间隔 2 天才产生完整数据。
 */
export async function fetchDouyinFansProfile(token: DouyinToken): Promise<DouyinFansProfile | null> {
  const payload = await safeFetchJson<DouyinFansDataPayload>(
    `${DOUYIN_FANS_PROFILE_URL}?${new URLSearchParams({ open_id: token.openId }).toString()}`,
    {
      headers: {
        "content-type": "application/json",
        "access-token": token.accessToken,
      },
    },
    "fans-profile",
  )
  const fans = payload?.data?.fans_data
  if (!fans) return null
  return {
    gender: toDistribution(fans.gender_distributions),
    ages: toDistribution(fans.age_distributions),
    provinces: toDistribution(fans.geographical_distributions),
    interests: toDistribution(fans.interest_distributions),
    activeDays: toDistribution(fans.active_days_distributions),
    devices: toDistribution(fans.device_distributions),
    allFansNum: typeof fans.all_fans_num === "number" ? fans.all_fans_num : null,
  }
}

export { syncDouyinDataToLarkBase } from "./douyin-lark-sync"

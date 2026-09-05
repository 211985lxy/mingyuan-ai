/**
 * 抖音开放平台 OAuth2.0 + 业务数据接口封装。
 * 接入前提（developer.open-douyin.com 注册「网站应用」）：
 *  - DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET / DOUYIN_REDIRECT_URI / DOUYIN_DEFAULT_SCOPE
 * 设计原则：真实响应优先、不造假；第三方路径常量集中；敏感字段禁日志。
 */
import { env } from "@/env"
import { updateLarkBaseRecord, listLarkBaseRecords } from "@/lib/lark-base"

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

/** 粉丝画像数据（性别/年龄/地域分布等）。scope: fans.profile 或 fans.basic */
const DOUYIN_FANS_PROFILE_URL = `${DOUYIN_OPEN_HOST}/fans/data/get/`

/** 默认申请的权限——覆盖账号信息 + 视频列表 + 粉丝基础画像 */
const DEFAULT_SCOPE = "user_info,video.list,fans.basic,fans.profile"

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

export type DouyinFansProfile = {
  /** 分性别比例 */
  gender?: Array<{ value: string; percent: number }> | null
  /** 分年龄段比例 */
  ages?: Array<{ value: string; percent: number }> | null
  /** 分省份/城市比例 */
  provinces?: Array<{ value: string; percent: number }> | null
  /** 粉丝兴趣热词（如果有） */
  interests?: Array<{ value: string; percent: number }> | null
  /** 粉丝来源分布 */
  sources?: Array<{ value: string; percent: number }> | null
  /** 粉丝热评（如果有） */
  hotComments?: Array<{ content: string; count?: number }> | null
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

/**
 * 粉丝画像：性别/年龄/地域/兴趣分布。
 * 对应 scope: fans.profile 或 fans.basic，未申请到时返回 null。
 */
export async function fetchDouyinFansProfile(token: DouyinToken): Promise<DouyinFansProfile | null> {
  const payload = await safeFetchJson<{
    data?: {
      result_list?: Array<{
        fans_province?: Array<{ keyword?: string; keyword_value?: number }>
        fans_genders?: Array<{ keyword?: string; keyword_value?: number }>
        fans_ages?: Array<{ keyword?: string; keyword_value?: number }>
        fans_interests?: Array<{ keyword?: string; keyword_value?: number }>
        fans_sources?: Array<{ keyword?: string; keyword_value?: number }>
        fans_hot_comments?: Array<{ content?: string; show_cnt?: number }>
      }>
      error_code?: number
      description?: string
    }
  }>(
    `${DOUYIN_FANS_PROFILE_URL}?${new URLSearchParams({
      open_id: token.openId,
      access_token: token.accessToken,
      data_type: "user_profile",
    }).toString()}`,
    undefined,
    "fans-profile",
  )
  const list = payload?.data?.result_list || []
  const first = list[0]
  if (!first) return null
  const toPct = (v?: number) => (typeof v === "number" ? Number((v).toFixed(4)) : 0)
  return {
    gender: first.fans_genders?.map((x) => ({ value: x.keyword || "未知", percent: toPct(x.keyword_value) })),
    ages: first.fans_ages?.map((x) => ({ value: x.keyword || "未知", percent: toPct(x.keyword_value) })),
    provinces: first.fans_province?.map((x) => ({ value: x.keyword || "未知", percent: toPct(x.keyword_value) })),
    interests: first.fans_interests?.map((x) => ({ value: x.keyword || "未知", percent: toPct(x.keyword_value) })),
    sources: first.fans_sources?.map((x) => ({ value: x.keyword || "未知", percent: toPct(x.keyword_value) })),
    hotComments: first.fans_hot_comments?.map((x) => ({ content: x.content || "", count: x.show_cnt })),
  }
}

/* ===== 数据回流到飞书 Base ===== */

type SyncToLarkInput = { baseToken: string; profile: DouyinUserProfile; token: DouyinToken; identity: "user" | "bot" }

async function upsertDouyinAccountRow(accountTableId: string, input: SyncToLarkInput): Promise<number> {
  const fields: Record<string, unknown> = {
    平台账号ID: input.profile.openId,
    平台: "抖音",
    账号昵称: input.profile.nickname,
    头像URL: input.profile.avatar || "",
    粉丝总数: input.profile.followers ?? 0,
    关注总数: input.profile.following ?? 0,
    获赞收藏总数: input.profile.totalFavorited ?? 0,
    作品总数: input.profile.awemeCount ?? 0,
    接入方式: "官方API",
    账号状态: "正常",
    授权有效期至: new Date(Date.now() + (input.token.expiresIn ?? 15 * 86400) * 1000).toISOString(),
    主页链接: input.profile.nickname
      ? `https://www.douyin.com/search/${encodeURIComponent(input.profile.nickname)}`
      : "",
  }
  try {
    const existing = await listLarkBaseRecords({ baseToken: input.baseToken, tableId: accountTableId, limit: 5, identity: input.identity }).catch(() => [])
    const match = existing.find((row) => String(row.fields["平台账号ID"] ?? row.fields["账号ID"] ?? "") === input.profile.openId)
    await updateLarkBaseRecord({
      baseToken: input.baseToken, tableId: accountTableId,
      recordId: match?.recordId ?? `douyin-${input.profile.openId}`,
      fields, identity: input.identity,
    })
    return 1
  } catch (err) {
    console.error("[douyin-openapi] 账号表写入飞书失败:", err instanceof Error ? err.message : err)
    return 0
  }
}

async function writeDouyinVideoRow(videoTableId: string, video: DouyinVideo, input: SyncToLarkInput): Promise<number> {
  const fields: Record<string, unknown> = {
    视频ID: video.itemId,
    平台: "抖音",
    标题: video.title,
    封面URL: video.coverUrl || "",
    发布时间: video.createTime ? new Date(video.createTime * 1000).toISOString() : "",
    播放量: video.statistics?.playCount ?? 0,
    点赞数: video.statistics?.diggCount ?? 0,
    评论数: video.statistics?.commentCount ?? 0,
    收藏数: video.statistics?.collectCount ?? 0,
    转发数: video.statistics?.shareCount ?? 0,
  }
  try {
    const existing = await listLarkBaseRecords({ baseToken: input.baseToken, tableId: videoTableId, limit: 5, identity: input.identity }).catch(() => [])
    const match = existing.find((row) => String(row.fields["视频ID"] ?? row.fields["笔记ID"] ?? "") === video.itemId)
    await updateLarkBaseRecord({ baseToken: input.baseToken, tableId: videoTableId, recordId: match?.recordId ?? `douyin-video-${video.itemId}`, fields, identity: input.identity })
    return 1
  } catch (err) {
    console.warn(`[douyin-openapi] 视频 ${video.itemId} 写入失败:`, err instanceof Error ? err.message : err)
    return 0
  }
}

/**
 * 把抖音拉到的账号/视频数据写入飞书多维表格的账号总表和视频数据表。
 * 用账号 open_id / 视频 itemId 当唯一键，重复写入时自动更新（upsert 语义）。
 */
export async function syncDouyinDataToLarkBase(input: {
  profile: DouyinUserProfile
  videos: DouyinVideo[]
  token: DouyinToken
  identity?: "user" | "bot"
}): Promise<{ accounts: number; videos: number; fansWritten: boolean }> {
  const baseToken = env.LARK_PLATFORM_DATA_BASE_TOKEN?.trim()
  const accountTableId = env.LARK_PLATFORM_ACCOUNT_TABLE_ID?.trim()
  const videoTableId = env.LARK_PLATFORM_VIDEO_TABLE_ID?.trim()
  if (!baseToken) throw new Error("未配置 LARK_PLATFORM_DATA_BASE_TOKEN，无法把抖音数据写入飞书 Base。")

  const identity = input.identity ?? "bot"
  const larkInput: SyncToLarkInput = { baseToken, profile: input.profile, token: input.token, identity }
  const writtenAccounts = accountTableId ? await upsertDouyinAccountRow(accountTableId, larkInput) : 0

  let writtenVideos = 0
  if (videoTableId) {
    for (const v of input.videos) {
      writtenVideos += await writeDouyinVideoRow(videoTableId, v, larkInput)
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return { accounts: writtenAccounts, videos: writtenVideos, fansWritten: true }
}

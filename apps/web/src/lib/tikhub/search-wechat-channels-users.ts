/**
 * 视频号账号昵称搜索。
 *
 * 旧路径 `/api/v1/wechat/channels/v2/search_user` 已下线（HTTP 404）。
 * 现统一走搜一搜 V2：POST `/api/v1/wechat_search/v2/fetch_search`
 * （business_type=account, raw=false），再筛出「视频号」结果。
 *
 * 红狐侧暂无已验证的视频号账号搜索 API，故直接走 TikHub。
 */

import { tikhubPost } from "@/lib/tikhub/client"

export interface WechatChannelsSearchUser {
  finder_username: string
  nickname: string
  avatar_url: string
  signature: string
  follower_count: number
  video_count: number
  is_verified: boolean
}

export interface WechatChannelsUserSearchResult {
  list: WechatChannelsSearchUser[]
  cursor: string
  has_more: boolean
}

interface FetchSearchAccountItem {
  title?: string
  desc?: string
  accTypeName?: string
  authInfo?: string
  thumbUrl?: string
  thumb_url?: string
  iconUrl?: string
  icon_url?: string
  jumpInfo?: {
    userName?: string
    username?: string
    nickName?: string
    nickname?: string
    signature?: string
    headImgUrl?: string
    head_img_url?: string
    headHDImgUrl?: string
    avatar?: string
  }
  noticeParam?: {
    finderUsername?: string
    finder_username?: string
  }
  source?: {
    title?: string
    iconUrl?: string
    icon_url?: string
  }
}

interface FetchSearchData {
  items?: FetchSearchAccountItem[]
  cursor?: string | null
  continue_flag?: boolean | number
}

function stripHighlight(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim()
}

function isChannelsAccount(item: FetchSearchAccountItem, finderUsername: string): boolean {
  const type = (item.accTypeName ?? "").trim()
  if (type.includes("视频号")) return true
  if (type.includes("公众号") || type.includes("服务号")) return false
  if (finderUsername.includes("@finder")) return true
  if (finderUsername.startsWith("gh_")) return false
  return Boolean(finderUsername)
}

function mapItem(item: FetchSearchAccountItem): WechatChannelsSearchUser | null {
  const jump = item.jumpInfo
  const finderUsername = String(
    item.noticeParam?.finderUsername
      ?? item.noticeParam?.finder_username
      ?? jump?.userName
      ?? jump?.username
      ?? "",
  ).trim()

  if (!finderUsername || !isChannelsAccount(item, finderUsername)) {
    return null
  }

  return {
    finder_username: finderUsername,
    nickname: stripHighlight(
      item.title ?? jump?.nickName ?? jump?.nickname ?? item.source?.title ?? "",
    ),
    avatar_url:
      item.thumbUrl
      ?? item.thumb_url
      ?? jump?.headHDImgUrl
      ?? jump?.headImgUrl
      ?? jump?.head_img_url
      ?? jump?.avatar
      ?? item.iconUrl
      ?? item.icon_url
      ?? item.source?.iconUrl
      ?? item.source?.icon_url
      ?? "",
    signature: stripHighlight(item.desc ?? jump?.signature ?? ""),
    follower_count: 0,
    video_count: 0,
    is_verified: Boolean(item.authInfo),
  }
}

/**
 * 按昵称 / 关键词搜索视频号账号（搜一搜 · 账号垂类，仅保留视频号）。
 */
export async function searchWechatChannelsUsers(input: {
  keyword: string
  cursor?: string
}): Promise<WechatChannelsUserSearchResult> {
  const data = await tikhubPost<FetchSearchData>("/api/v1/wechat_search/v2/fetch_search", {
    keyword: input.keyword.trim().slice(0, 100),
    business_type: "account",
    sort: "default",
    cursor: input.cursor || undefined,
    raw: false,
  })

  const list = (data.items ?? [])
    .map(mapItem)
    .filter((item): item is WechatChannelsSearchUser => item != null)

  return {
    list,
    cursor: data.cursor ?? "",
    has_more: Boolean(data.continue_flag),
  }
}

/**
 * 视频号关键词搜索 —— TikHub 已弃用
 * `/api/v1/wechat/search/v2/search_channels_video`（404）。
 * 现统一走搜一搜 V2：POST `/api/v1/wechat_search/v2/fetch_search`
 * （business_type=video, raw=false）。
 */

import { tikhubPost } from "@/lib/tikhub/client"

export type WechatChannelsVideoSort = "comprehensive" | "latest" | "popular"

export interface WechatChannelsSearchVideo {
  object_id: string
  video_id: string
  export_id: string
  description: string
  title: string
  cover_url: string
  create_time: number
  duration: number
  play_count: number
  like_count: number
  comment_count: number
  share_count: number
  collect_count: number
  nickname: string
  finder_username: string
  avatar_url: string
}

export interface WechatChannelsSearchResult {
  list: WechatChannelsSearchVideo[]
  cursor: string
  has_more: boolean
}

interface FetchSearchItem {
  title?: string
  desc?: string
  docID?: string | number
  docId?: string | number
  exportId?: string
  export_id?: string
  image?: string
  coverUrl?: string
  cover_url?: string
  thumbUrl?: string
  thumb_url?: string
  duration?: number | string
  dateTime?: string
  createTime?: number
  create_time?: number
  publishTime?: number
  publish_time?: number
  pubTime?: number
  likeNum?: number | string
  likeCount?: number
  like_count?: number
  playCount?: number
  play_count?: number
  readCount?: number
  read_count?: number
  commentCount?: number
  comment_count?: number
  shareCount?: number
  share_count?: number
  collectCount?: number
  collect_count?: number
  source?: {
    title?: string
    iconUrl?: string
    icon_url?: string
  }
  jumpInfo?: {
    nickName?: string
    nickname?: string
    userName?: string
    username?: string
    headImgUrl?: string
    head_img_url?: string
    avatar?: string
    extInfo?: string | { feedNonceId?: string | number; encryptedObjectId?: string }
  }
}

interface FetchSearchData {
  items?: FetchSearchItem[]
  cursor?: string | null
  continue_flag?: boolean | number
  count?: number
}

function stripHighlight(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim()
}

function toSort(sortType?: WechatChannelsVideoSort): string {
  if (sortType === "latest") return "latest"
  if (sortType === "popular") return "hot"
  return "default"
}

/** 解析「10万+」「1.2万」「00:42」等展示值 */
function parseDisplayCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return 0
  const text = value.trim()
  if (!text) return 0
  if (/^\d+$/.test(text)) return Number(text)
  const wan = text.match(/^([\d.]+)\s*万\+?$/)
  if (wan) return Math.round(Number(wan[1]) * 10_000)
  const yi = text.match(/^([\d.]+)\s*亿\+?$/)
  if (yi) return Math.round(Number(yi[1]) * 100_000_000)
  return 0
}

function parseDurationSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    // TikHub 有时返回毫秒
    return value > 10_000 ? Math.round(value / 1000) : Math.round(value)
  }
  if (typeof value !== "string") return 0
  const parts = value.split(":").map((part) => Number(part))
  if (parts.some((n) => !Number.isFinite(n))) return 0
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!
  return 0
}

function readExtInfo(jump?: FetchSearchItem["jumpInfo"]): { encryptedObjectId?: string; feedNonceId?: string } {
  const raw = jump?.extInfo
  if (!raw) return {}
  if (typeof raw === "object") {
    return {
      encryptedObjectId: raw.encryptedObjectId,
      feedNonceId: raw.feedNonceId == null ? undefined : String(raw.feedNonceId),
    }
  }
  try {
    const parsed = JSON.parse(raw) as { encryptedObjectId?: string; feedNonceId?: string | number }
    return {
      encryptedObjectId: parsed.encryptedObjectId,
      feedNonceId: parsed.feedNonceId == null ? undefined : String(parsed.feedNonceId),
    }
  } catch {
    return {}
  }
}

function mapItem(item: FetchSearchItem): WechatChannelsSearchVideo {
  const ext = readExtInfo(item.jumpInfo)
  const exportId = String(item.exportId ?? item.export_id ?? ext.encryptedObjectId ?? "")
  const docId = String(item.docID ?? item.docId ?? "")
  const id = exportId || docId
  const title = stripHighlight(item.title ?? item.desc ?? "")
  const jump = item.jumpInfo
  const source = item.source

  return {
    object_id: id,
    video_id: id,
    export_id: exportId,
    description: title,
    title,
    cover_url: item.image ?? item.cover_url ?? item.coverUrl ?? item.thumb_url ?? item.thumbUrl ?? "",
    create_time: item.pubTime ?? item.create_time ?? item.createTime ?? item.publish_time ?? item.publishTime ?? 0,
    duration: parseDurationSeconds(item.duration),
    play_count: parseDisplayCount(item.play_count ?? item.playCount ?? item.read_count ?? item.readCount),
    like_count: parseDisplayCount(item.likeNum ?? item.like_count ?? item.likeCount),
    comment_count: parseDisplayCount(item.comment_count ?? item.commentCount),
    share_count: parseDisplayCount(item.share_count ?? item.shareCount),
    collect_count: parseDisplayCount(item.collect_count ?? item.collectCount),
    nickname: source?.title ?? jump?.nickName ?? jump?.nickname ?? "",
    finder_username: jump?.userName ?? jump?.username ?? "",
    avatar_url: source?.iconUrl ?? source?.icon_url ?? jump?.headImgUrl ?? jump?.head_img_url ?? jump?.avatar ?? "",
  }
}

/**
 * 按关键词搜索视频号视频（搜一搜 · 视频垂类）。
 */
export async function searchWechatChannelsVideos(input: {
  keyword: string
  cursor?: string
  sortType?: WechatChannelsVideoSort
  count?: number
}): Promise<WechatChannelsSearchResult> {
  const data = await tikhubPost<FetchSearchData>("/api/v1/wechat_search/v2/fetch_search", {
    keyword: input.keyword.trim().slice(0, 100),
    business_type: "video",
    sort: toSort(input.sortType),
    cursor: input.cursor || undefined,
    raw: false,
  })

  const list = (data.items ?? []).map(mapItem)
  const limited = typeof input.count === "number" ? list.slice(0, input.count) : list

  return {
    list: limited,
    cursor: data.cursor ?? "",
    has_more: Boolean(data.continue_flag),
  }
}

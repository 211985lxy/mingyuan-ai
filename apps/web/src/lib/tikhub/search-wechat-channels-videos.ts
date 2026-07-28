/**
 * 视频号关键词搜索。
 *
 * 优先级：RedFox（`/story/api/sphData/searchArticle`）→ TikHub 搜一搜 V2。
 * 说明：红狐官方 SDK / 本仓暂无已验证的视频号搜索；`sphData` 对齐 `dyData` 命名，
 * 当前线上返回「资源不存在」时会自动降级 TikHub。
 */

import { redfoxPost } from "@/lib/redfox/client"
import { tikhubPost } from "@/lib/tikhub/client"
import { logger } from "@/lib/logger"

const log = logger.child({ component: "WechatChannelsVideoSearch" })

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

interface SearchInput {
  keyword: string
  cursor?: string
  sortType?: WechatChannelsVideoSort
  count?: number
}

// ─── RedFox wire ───────────────────────────────────────────

interface RedFoxSphArticle {
  workId?: string
  objectId?: string
  exportId?: string
  videoId?: string
  title?: string
  content?: string
  desc?: string
  description?: string
  workUrl?: string
  shareUrl?: string
  coverUrl?: string
  duration?: number
  publishTime?: number | string
  likeCount?: number
  commentCount?: number
  shareCount?: number
  collectCount?: number
  playCount?: number
  authorId?: string
  accountName?: string
  nickname?: string
  finderUsername?: string
  avatarUrl?: string
}

interface RedFoxSphSearchResult {
  list?: RedFoxSphArticle[]
  articles?: RedFoxSphArticle[]
  hasMore?: boolean | number
  cursor?: string
}

function redfoxSortType(sortType?: WechatChannelsVideoSort): string {
  if (sortType === "latest") return "_1"
  if (sortType === "popular") return "_2"
  return "_0"
}

function mapRedFoxItem(item: RedFoxSphArticle): WechatChannelsSearchVideo {
  const id = String(
    item.objectId ?? item.exportId ?? item.workId ?? item.videoId ?? "",
  )
  const title = item.title ?? item.description ?? item.content ?? item.desc ?? ""
  const publish = item.publishTime == null ? 0 : Number(item.publishTime)
  const createTime =
    publish > 1e12 ? Math.round(publish / 1000) : Number.isFinite(publish) ? publish : 0

  return {
    object_id: id,
    video_id: id,
    export_id: String(item.exportId ?? id),
    description: title,
    title,
    cover_url: item.coverUrl ?? "",
    create_time: createTime,
    duration: item.duration
      ? item.duration > 10_000
        ? Math.round(item.duration / 1000)
        : Math.round(item.duration)
      : 0,
    play_count: item.playCount ?? 0,
    like_count: item.likeCount ?? 0,
    comment_count: item.commentCount ?? 0,
    share_count: item.shareCount ?? 0,
    collect_count: item.collectCount ?? 0,
    nickname: item.accountName ?? item.nickname ?? "",
    finder_username: item.finderUsername ?? item.authorId ?? "",
    avatar_url: item.avatarUrl ?? "",
  }
}

async function searchViaRedFox(input: SearchInput): Promise<WechatChannelsSearchResult> {
  const data = await redfoxPost<RedFoxSphSearchResult>(
    "/story/api/sphData/searchArticle",
    {
      keyword: input.keyword.trim().slice(0, 100),
      offset: 0,
      sortType: redfoxSortType(input.sortType),
    },
  )

  const list = (data.list ?? data.articles ?? []).map(mapRedFoxItem)
  const limited = typeof input.count === "number" ? list.slice(0, input.count) : list

  return {
    list: limited,
    cursor: data.cursor ?? "",
    has_more: Boolean(data.hasMore),
  }
}

// ─── TikHub wire（搜一搜 V2）────────────────────────────────

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
  source?: { title?: string; iconUrl?: string; icon_url?: string }
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
}

function stripHighlight(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim()
}

function toTikHubSort(sortType?: WechatChannelsVideoSort): string {
  if (sortType === "latest") return "latest"
  if (sortType === "popular") return "hot"
  return "default"
}

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
    return value > 10_000 ? Math.round(value / 1000) : Math.round(value)
  }
  if (typeof value !== "string") return 0
  const parts = value.split(":").map((part) => Number(part))
  if (parts.some((n) => !Number.isFinite(n))) return 0
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!
  return 0
}

function readExtInfo(
  jump?: FetchSearchItem["jumpInfo"],
): { encryptedObjectId?: string; feedNonceId?: string } {
  const raw = jump?.extInfo
  if (!raw) return {}
  if (typeof raw === "object") {
    return {
      encryptedObjectId: raw.encryptedObjectId,
      feedNonceId: raw.feedNonceId == null ? undefined : String(raw.feedNonceId),
    }
  }
  try {
    const parsed = JSON.parse(raw) as {
      encryptedObjectId?: string
      feedNonceId?: string | number
    }
    return {
      encryptedObjectId: parsed.encryptedObjectId,
      feedNonceId: parsed.feedNonceId == null ? undefined : String(parsed.feedNonceId),
    }
  } catch {
    return {}
  }
}

function mapTikHubItem(item: FetchSearchItem): WechatChannelsSearchVideo {
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

async function searchViaTikHub(input: SearchInput): Promise<WechatChannelsSearchResult> {
  const data = await tikhubPost<FetchSearchData>("/api/v1/wechat_search/v2/fetch_search", {
    keyword: input.keyword.trim().slice(0, 100),
    business_type: "video",
    sort: toTikHubSort(input.sortType),
    cursor: input.cursor || undefined,
    raw: false,
  })

  const list = (data.items ?? []).map(mapTikHubItem)
  const limited = typeof input.count === "number" ? list.slice(0, input.count) : list

  return {
    list: limited,
    cursor: data.cursor ?? "",
    has_more: Boolean(data.continue_flag),
  }
}

/**
 * 按关键词搜索视频号视频：RedFox 优先，失败再 TikHub。
 */
export async function searchWechatChannelsVideos(
  input: SearchInput,
): Promise<WechatChannelsSearchResult> {
  try {
    return await searchViaRedFox(input)
  } catch (err) {
    log.warn(
      { err, keyword: input.keyword },
      "RedFox 视频号搜索失败，降级到 TikHub",
    )
  }

  return searchViaTikHub(input)
}

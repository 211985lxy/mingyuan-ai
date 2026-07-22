import { redfoxPost, hasRedFoxApiKey } from "@/lib/redfox/client"
import { tikhubGet } from "@/lib/tikhub/client"
import { logger } from "@/lib/logger"
import type {
  FilterCapability,
  OpportunityItem,
  OpportunityPlatform,
  SearchFilters,
} from "../contracts/types"
import type {
  SearchAdapter,
  SearchAdapterParams,
  SearchAdapterResult,
} from "./adapter-interface"

const log = logger.child({ component: "DouyinSearchAdapter" })

// ─── RedFox Wire Types ───────────────────────────────────

interface RedFoxSearchArticleItem {
  workId?: string
  title?: string
  content?: string
  workUrl?: string
  coverUrl?: string
  audioUrl?: string
  workType?: string
  duration?: number
  publishTime?: string
  repostCount?: number
  commentCount?: number
  shareCount?: number
  likeCount?: number
  collectCount?: number
  commentTopKeywords?: string[]
  isPromotion?: number
  authorId?: string
  accountName?: string
  authorLink?: string
  authorUrl?: string
  followerCount?: number
  crawlTime?: string
}

interface RedFoxSearchArticleData {
  total?: number
  hasMore?: boolean | number
  list?: RedFoxSearchArticleItem[]
}

// ─── TikHub Wire Types ───────────────────────────────────

interface TikHubSearchVideoItem {
  aweme_id?: string
  desc?: string
  video?: { duration?: number; cover?: { url_list?: string[] } }
  create_time?: number
  statistics?: {
    play_count?: number
    digg_count?: number
    comment_count?: number
    share_count?: number
    collect_count?: number
  }
  author?: {
    uid?: string
    nickname?: string
    follower_count?: number
  }
}

interface TikHubSearchVideoData {
  data?: TikHubSearchVideoItem[]
  cursor?: number
  has_more?: number
}

// ─── Adapter ─────────────────────────────────────────────

export class DouyinSearchAdapter implements SearchAdapter {
  readonly platform: OpportunityPlatform = "douyin"

  async searchVideos(params: SearchAdapterParams): Promise<SearchAdapterResult> {
    if (hasRedFoxApiKey()) {
      try {
        return await this.searchViaRedFox(params)
      } catch (err) {
        log.warn({ err, keyword: params.keyword }, "RedFox 抖音搜索失败，降级至 TikHub")
      }
    }
    return this.searchViaTikHub(params)
  }

  supportedFilters(): FilterCapability[] {
    return [
      { key: "timeRange", label: "时间范围", supported: true, note: "RedFox 优质库按发布时间过滤" },
      { key: "sortOrder", label: "排序", supported: true },
      { key: "durationMin", label: "最短时长", supported: false, note: "RedFox 搜索不支持时长筛选，需结果侧过滤" },
      { key: "durationMax", label: "最长时长", supported: false, note: "同上" },
      { key: "followerMin", label: "粉丝下限", supported: false, note: "结果侧过滤" },
      { key: "followerMax", label: "粉丝上限", supported: false, note: "结果侧过滤" },
      { key: "viewsMin", label: "播放下限", supported: false, note: "结果侧过滤" },
      { key: "likesMin", label: "点赞下限", supported: false, note: "结果侧过滤" },
      { key: "commentsMin", label: "评论下限", supported: false, note: "结果侧过滤" },
      { key: "lowFollowerViral", label: "低粉爆款", supported: true, note: "结果侧计算" },
      { key: "highEngagement", label: "高互动", supported: true, note: "结果侧计算" },
      { key: "watchedAccountsOnly", label: "仅看已监控", supported: false },
    ]
  }

  // ─── RedFox Primary ──────────────────────────────────

  private async searchViaRedFox(params: SearchAdapterParams): Promise<SearchAdapterResult> {
    const sortType = mapSortToRedFox(params.filters?.sortOrder)
    const body: Record<string, unknown> = {
      keyword: params.keyword,
      offset: params.cursor ? Number(params.cursor) : 0,
      sortType,
    }

    const data = await redfoxPost<RedFoxSearchArticleData>(
      "/story/api/dyData/searchArticle",
      body,
    )

    const list = Array.isArray(data.list) ? data.list : []
    const items = list
      .map((raw) => normalizeRedFoxItem(raw, params.keyword))
      .filter((item): item is OpportunityItem => item !== null)

    return {
      items: items.slice(0, params.count),
      cursor: String((params.cursor ? Number(params.cursor) : 0) + list.length),
      hasMore: Boolean(data.hasMore),
      total: data.total,
    }
  }

  // ─── TikHub Fallback ─────────────────────────────────

  private async searchViaTikHub(params: SearchAdapterParams): Promise<SearchAdapterResult> {
    const sortType = mapSortToTikHub(params.filters?.sortOrder)
    const publishTime = mapTimeRangeToTikHub(params.filters?.timeRange)

    const data = await tikhubGet<TikHubSearchVideoData>(
      "/api/v1/douyin/web/search_video",
      {
        keyword: params.keyword,
        offset: params.cursor ? Number(params.cursor) : 0,
        count: params.count,
        sort_type: sortType,
        publish_time: publishTime,
      },
    )

    const list = data.data ?? []
    const items = list
      .map((raw) => normalizeTikHubItem(raw, params.keyword))
      .filter((item): item is OpportunityItem => item !== null)

    return {
      items,
      cursor: data.cursor !== undefined ? String(data.cursor) : undefined,
      hasMore: Boolean(data.has_more),
    }
  }
}

// ─── Normalizers ─────────────────────────────────────────

function normalizeRedFoxItem(
  raw: RedFoxSearchArticleItem,
  keyword: string,
): OpportunityItem | null {
  if (!raw.workId) return null

  return {
    platform: "douyin",
    sourceId: raw.workId,
    sourceUrl: raw.workUrl || `https://www.douyin.com/video/${raw.workId}`,
    title: raw.title || firstLine(raw.content) || "",
    author: {
      id: raw.authorId,
      name: raw.accountName || "",
      followerCount: numOrUndefined(raw.followerCount),
    },
    publishedAt: raw.publishTime ? toISO(raw.publishTime) : undefined,
    durationSeconds: numOrUndefined(raw.duration),
    metrics: {
      views: undefined, // RedFox 搜索不返回播放量
      likes: numOrUndefined(raw.likeCount),
      comments: numOrUndefined(raw.commentCount),
      shares: numOrUndefined(raw.shareCount ?? raw.repostCount),
      collects: numOrUndefined(raw.collectCount),
    },
    scoreConfidence: "medium",
    matchedKeywords: keyword ? [keyword] : [],
    fetchedAt: new Date().toISOString(),
  }
}

function normalizeTikHubItem(
  raw: TikHubSearchVideoItem,
  keyword: string,
): OpportunityItem | null {
  if (!raw.aweme_id) return null

  return {
    platform: "douyin",
    sourceId: raw.aweme_id,
    sourceUrl: `https://www.douyin.com/video/${raw.aweme_id}`,
    title: raw.desc || "",
    author: {
      id: raw.author?.uid,
      name: raw.author?.nickname || "",
      followerCount: numOrUndefined(raw.author?.follower_count),
    },
    publishedAt: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : undefined,
    durationSeconds: raw.video?.duration
      ? Math.round(raw.video.duration / 1000)
      : undefined,
    metrics: {
      views: numOrUndefined(raw.statistics?.play_count),
      likes: numOrUndefined(raw.statistics?.digg_count),
      comments: numOrUndefined(raw.statistics?.comment_count),
      shares: numOrUndefined(raw.statistics?.share_count),
      collects: numOrUndefined(raw.statistics?.collect_count),
    },
    scoreConfidence: "medium",
    matchedKeywords: keyword ? [keyword] : [],
    fetchedAt: new Date().toISOString(),
  }
}

// ─── Helpers ─────────────────────────────────────────────

function mapSortToRedFox(sort?: string): string {
  switch (sort) {
    case "latest":
      return "_1"
    case "popular":
      return "_2"
    default:
      return "default"
  }
}

function mapSortToTikHub(sort?: string): string {
  switch (sort) {
    case "latest":
      return "1"
    case "popular":
      return "2"
    default:
      return "0"
  }
}

function mapTimeRangeToTikHub(timeRange?: string): string | undefined {
  switch (timeRange) {
    case "24h":
      return "1"
    case "7d":
      return "7"
    case "30d":
      return "30"
    default:
      return undefined
  }
}

function firstLine(value?: string): string {
  return value?.split(/\r?\n/, 1)[0]?.slice(0, 80) ?? ""
}

function toISO(value: string): string | undefined {
  const d = new Date(value.replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

function numOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
  return undefined
}

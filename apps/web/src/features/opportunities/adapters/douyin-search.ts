import { redfoxPost } from "@/lib/redfox/client"
import { tikhubPost } from "@/lib/tikhub/client"
import { logger } from "@/lib/logger"
import type { OpportunityItem } from "../contracts/types"
import type { SearchAdapter, PlatformSearchInput, PlatformSearchOutput } from "./adapter-interface"

const log = logger.child({ component: "DouyinSearchAdapter" })

export function toIsoPublishedAt(value: number | string | undefined): string | undefined {
  if (value == null || value === "") return undefined
  if (typeof value === "string" && Number.isNaN(Number(value))) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
  }
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return undefined
  const ms = num > 1e12 ? num : num * 1000
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

// ─── RedFox Wire Types ─────────────────────────────────────

interface RedFoxSearchArticle {
  workId?: string
  awemeId?: string
  title?: string
  content?: string
  desc?: string
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
  uid?: string
  accountName?: string
  nickname?: string
  followerCount?: number
  fansCount?: number
}

interface RedFoxSearchResult {
  list?: RedFoxSearchArticle[]
  articles?: RedFoxSearchArticle[]
  total?: number
  hasMore?: boolean
}

// ─── TikHub Wire Types（Search V2）──────────────────────────

interface TikHubAwemeInfo {
  aweme_id?: string
  desc?: string
  share_url?: string
  video?: { cover?: { url_list?: string[] }; duration?: number }
  create_time?: number
  statistics?: {
    play_count?: number
    digg_count?: number
    comment_count?: number
    share_count?: number
    collect_count?: number
  }
  author?: { uid?: string; nickname?: string; follower_count?: number }
}

interface TikHubSearchV2Item {
  type?: number
  data?: {
    type?: number
    aweme_info?: TikHubAwemeInfo
  }
}

interface TikHubSearchV2Data {
  business_data?: TikHubSearchV2Item[]
  cursor?: number
  has_more?: number
}

// ─── Sort Mapping ──────────────────────────────────────────

function redfoxSortType(sortOrder?: string): string {
  switch (sortOrder) {
    case "latest": return "_1"
    case "popular": return "_2"
    default: return "_0" // comprehensive
  }
}

/** TikHub V2: 0=综合 1=最多点赞 2=最新发布 */
function tikhubSortType(sortOrder?: string): string {
  switch (sortOrder) {
    case "popular": return "1"
    case "latest": return "2"
    default: return "0"
  }
}

/** TikHub V2: 0=不限 1=最近一天 7=最近一周 180=最近半年 */
function tikhubPublishTime(timeRange?: string): string {
  switch (timeRange) {
    case "24h": return "1"
    case "7d": return "7"
    case "30d": return "180"
    default: return "0"
  }
}

// ─── Adapter ───────────────────────────────────────────────

export class DouyinSearchAdapter implements SearchAdapter {
  readonly platform = "douyin" as const

  async search(input: PlatformSearchInput): Promise<PlatformSearchOutput> {
    const start = Date.now()

    // RedFox 优先
    try {
      const items = await this.searchViaRedFox(input)
      return { platform: this.platform, status: "ok", items, durationMs: Date.now() - start }
    } catch (err) {
      log.warn({ err, keyword: input.keyword }, "RedFox 抖音搜索失败，降级到 TikHub")
    }

    // TikHub 兜底
    try {
      const items = await this.searchViaTikHub(input)
      return { platform: this.platform, status: "ok", items, durationMs: Date.now() - start }
    } catch (err) {
      const message = err instanceof Error ? err.message : "抖音搜索失败"
      log.error({ err, keyword: input.keyword }, "TikHub 抖音搜索也失败")
      return { platform: this.platform, status: "error", items: [], error: message, durationMs: Date.now() - start }
    }
  }

  // ─── RedFox: POST /story/api/dyData/searchArticle ───

  private async searchViaRedFox(input: PlatformSearchInput): Promise<OpportunityItem[]> {
    const data = await redfoxPost<RedFoxSearchResult>(
      "/story/api/dyData/searchArticle",
      {
        keyword: input.keyword,
        offset: 0,
        sortType: redfoxSortType(input.filters?.sortOrder),
      },
    )

    const list = data.list ?? data.articles ?? []
    return list.slice(0, input.count).flatMap((item) => {
      try {
        return [this.normalizeRedFox(item)]
      } catch (err) {
        log.warn({ err, sourceId: item.workId ?? item.awemeId }, "跳过无法规范化的 RedFox 抖音结果")
        return []
      }
    })
  }

  private normalizeRedFox(item: RedFoxSearchArticle): OpportunityItem {
    const sourceId = item.workId ?? item.awemeId ?? ""
    const title = item.title ?? item.content ?? item.desc ?? ""
    const sourceUrl = item.workUrl ?? item.shareUrl ?? `https://www.douyin.com/video/${sourceId}`

    return {
      platform: "douyin",
      sourceId,
      sourceUrl,
      title,
      coverUrl: item.coverUrl,
      author: {
        id: item.authorId ?? item.uid ?? "",
        name: item.accountName ?? item.nickname ?? "",
        followerCount: item.followerCount ?? item.fansCount,
      },
      publishedAt: toIsoPublishedAt(item.publishTime),
      durationSeconds: item.duration ? Math.round(item.duration / 1000) : undefined,
      metrics: {
        views: item.playCount,
        likes: item.likeCount,
        comments: item.commentCount,
        shares: item.shareCount,
        collects: item.collectCount,
      },
      scoreConfidence: item.playCount != null ? "high" : "medium",
    }
  }

  // ─── TikHub: POST /api/v1/douyin/search/fetch_video_search_v2 ───

  private async searchViaTikHub(input: PlatformSearchInput): Promise<OpportunityItem[]> {
    const data = await tikhubPost<TikHubSearchV2Data>(
      "/api/v1/douyin/search/fetch_video_search_v2",
      {
        keyword: input.keyword,
        cursor: 0,
        sort_type: tikhubSortType(input.filters?.sortOrder),
        publish_time: tikhubPublishTime(input.filters?.timeRange),
        filter_duration: "0",
        content_type: "1",
        search_id: "",
        backtrace: "",
      },
    )

    const list = (data.business_data ?? [])
      .map((row) => row.data?.aweme_info)
      .filter((info): info is TikHubAwemeInfo => Boolean(info?.aweme_id))

    return list.slice(0, input.count).map((item) => this.normalizeTikHub(item))
  }

  private normalizeTikHub(item: TikHubAwemeInfo): OpportunityItem {
    const sourceId = item.aweme_id ?? ""
    const stats = item.statistics ?? {}

    return {
      platform: "douyin",
      sourceId,
      sourceUrl: item.share_url ?? `https://www.douyin.com/video/${sourceId}`,
      title: item.desc ?? "",
      coverUrl: item.video?.cover?.url_list?.[0],
      author: {
        id: item.author?.uid ?? "",
        name: item.author?.nickname ?? "",
        followerCount: item.author?.follower_count,
      },
      publishedAt: item.create_time ? new Date(item.create_time * 1000).toISOString() : undefined,
      durationSeconds: item.video?.duration ? Math.round(item.video.duration / 1000) : undefined,
      metrics: {
        views: stats.play_count,
        likes: stats.digg_count,
        comments: stats.comment_count,
        shares: stats.share_count,
        collects: stats.collect_count,
      },
      scoreConfidence: "high",
    }
  }
}

import { tikhubGet } from "@/lib/tikhub/client"
import { logger } from "@/lib/logger"
import type {
  FilterCapability,
  OpportunityItem,
  OpportunityPlatform,
} from "../contracts/types"
import type {
  SearchAdapter,
  SearchAdapterParams,
  SearchAdapterResult,
} from "./adapter-interface"

const log = logger.child({ component: "WechatChannelsSearchAdapter" })

// ─── TikHub Wire Types (WeChat Channels V2) ──────────────

interface WxSearchVideoItem {
  object_id?: string
  video_id?: string
  description?: string
  title?: string
  cover_url?: string
  thumb_url?: string
  create_time?: number
  publish_time?: number
  duration?: number
  play_count?: number
  read_count?: number
  like_count?: number
  recommend_count?: number
  comment_count?: number
  share_count?: number
  forward_count?: number
  collect_count?: number
  fav_count?: number
  nickname?: string
  finder_username?: string
  avatar_url?: string
}

interface WxSearchVideoResult {
  list?: WxSearchVideoItem[]
  video_list?: WxSearchVideoItem[]
  cursor?: string
  next_cursor?: string
  has_more?: boolean | number
}

// ─── Adapter ─────────────────────────────────────────────

export class WechatChannelsSearchAdapter implements SearchAdapter {
  readonly platform: OpportunityPlatform = "wechat_channels"

  async searchVideos(params: SearchAdapterParams): Promise<SearchAdapterResult> {
    const sortTypeMap: Record<string, string> = {
      comprehensive: "0",
      latest: "1",
      popular: "2",
    }

    try {
      const data = await tikhubGet<WxSearchVideoResult>(
        "/api/v1/wechat/search/v2/search_channels_video",
        {
          keyword: params.keyword,
          cursor: params.cursor || undefined,
          count: params.count,
          sort_type: params.filters?.sortOrder
            ? sortTypeMap[params.filters.sortOrder]
            : undefined,
        },
      )

      const rawItems = data.list ?? data.video_list ?? []
      const items = rawItems
        .map((raw) => normalizeWxItem(raw, params.keyword))
        .filter((item): item is OpportunityItem => item !== null)

      return {
        items: items.slice(0, params.count),
        cursor: data.cursor ?? data.next_cursor ?? undefined,
        hasMore: Boolean(data.has_more),
      }
    } catch (err) {
      log.warn({ err, keyword: params.keyword }, "视频号搜索失败")
      throw err
    }
  }

  supportedFilters(): FilterCapability[] {
    return [
      { key: "timeRange", label: "时间范围", supported: false, note: "视频号搜索 API 不支持时间筛选" },
      { key: "sortOrder", label: "排序", supported: true, note: "综合/最新/最热" },
      { key: "durationMin", label: "最短时长", supported: false, note: "结果侧过滤" },
      { key: "durationMax", label: "最长时长", supported: false, note: "结果侧过滤" },
      { key: "followerMin", label: "粉丝下限", supported: false, note: "视频号不返回粉丝数" },
      { key: "followerMax", label: "粉丝上限", supported: false, note: "同上" },
      { key: "viewsMin", label: "播放下限", supported: false, note: "结果侧过滤" },
      { key: "likesMin", label: "点赞下限", supported: false, note: "结果侧过滤" },
      { key: "commentsMin", label: "评论下限", supported: false, note: "结果侧过滤" },
      { key: "lowFollowerViral", label: "低粉爆款", supported: false, note: "视频号无粉丝数据" },
      { key: "highEngagement", label: "高互动", supported: true, note: "结果侧计算" },
      { key: "watchedAccountsOnly", label: "仅看已监控", supported: false },
    ]
  }
}

// ─── Normalizer ──────────────────────────────────────────

function normalizeWxItem(
  raw: WxSearchVideoItem,
  keyword: string,
): OpportunityItem | null {
  const sourceId = raw.object_id ?? raw.video_id
  if (!sourceId) return null

  return {
    platform: "wechat_channels",
    sourceId,
    sourceUrl: `https://channels.weixin.qq.com/web/pages/feed/${sourceId}`,
    title: raw.description ?? raw.title ?? "",
    author: {
      id: raw.finder_username,
      name: raw.nickname ?? "",
      followerCount: undefined,
    },
    publishedAt: raw.create_time
      ? new Date(raw.create_time * 1000).toISOString()
      : raw.publish_time
        ? new Date(raw.publish_time * 1000).toISOString()
        : undefined,
    durationSeconds: numOrUndefined(raw.duration),
    metrics: {
      views: numOrUndefined(raw.play_count ?? raw.read_count),
      likes: numOrUndefined(raw.like_count ?? raw.recommend_count),
      comments: numOrUndefined(raw.comment_count),
      shares: numOrUndefined(raw.share_count ?? raw.forward_count),
      collects: numOrUndefined(raw.collect_count ?? raw.fav_count),
    },
    scoreConfidence: "medium",
    matchedKeywords: keyword ? [keyword] : [],
    fetchedAt: new Date().toISOString(),
  }
}

function numOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
  return undefined
}

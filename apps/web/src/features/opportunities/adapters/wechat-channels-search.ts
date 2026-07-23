import { tikhubGet } from "@/lib/tikhub/client"
import { logger } from "@/lib/logger"
import type { OpportunityItem } from "../contracts/types"
import type { SearchAdapter, PlatformSearchInput, PlatformSearchOutput } from "./adapter-interface"

const log = logger.child({ component: "WechatChannelsSearchAdapter" })

// ─── Wire Types ────────────────────────────────────────────

interface WxVideoItem {
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

interface WxSearchResult {
  list?: WxVideoItem[]
  video_list?: WxVideoItem[]
  cursor?: string
  next_cursor?: string
  has_more?: boolean | number
}

// ─── Sort Mapping ──────────────────────────────────────────

function wxSortType(sortOrder?: string): string | undefined {
  switch (sortOrder) {
    case "latest": return "1"
    case "popular": return "2"
    default: return undefined // comprehensive = default
  }
}

// ─── Adapter ───────────────────────────────────────────────

export class WechatChannelsSearchAdapter implements SearchAdapter {
  readonly platform = "wechat_channels" as const

  async search(input: PlatformSearchInput): Promise<PlatformSearchOutput> {
    const start = Date.now()

    try {
      const data = await tikhubGet<WxSearchResult>(
        "/api/v1/wechat/search/v2/search_channels_video",
        {
          keyword: input.keyword,
          count: input.count,
          sort_type: wxSortType(input.filters?.sortOrder),
        },
      )

      const list = data.list ?? data.video_list ?? []
      const items = list.slice(0, input.count).map((item) => this.normalize(item))

      return { platform: this.platform, status: "ok", items, durationMs: Date.now() - start }
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频号搜索失败"
      log.error({ err, keyword: input.keyword }, "视频号搜索失败")
      return { platform: this.platform, status: "error", items: [], error: message, durationMs: Date.now() - start }
    }
  }

  private normalize(item: WxVideoItem): OpportunityItem {
    const sourceId = item.object_id ?? item.video_id ?? ""
    const title = item.description ?? item.title ?? ""

    return {
      platform: "wechat_channels",
      sourceId,
      sourceUrl: `https://channels.weixin.qq.com/video/${sourceId}`,
      title,
      coverUrl: item.cover_url ?? item.thumb_url,
      author: {
        id: item.finder_username ?? "",
        name: item.nickname ?? "",
      },
      publishedAt: item.create_time
        ? new Date(item.create_time * 1000).toISOString()
        : item.publish_time
          ? new Date(item.publish_time * 1000).toISOString()
          : undefined,
      durationSeconds: item.duration ? Math.round(item.duration / 1000) : undefined,
      metrics: {
        views: item.play_count ?? item.read_count,
        likes: item.like_count ?? item.recommend_count,
        comments: item.comment_count,
        shares: item.share_count ?? item.forward_count,
        collects: item.collect_count ?? item.fav_count,
      },
      scoreConfidence: "medium",
    }
  }
}

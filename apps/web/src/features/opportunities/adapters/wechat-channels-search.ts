import { logger } from "@/lib/logger"
import { searchWechatChannelsVideos } from "@/lib/tikhub/search-wechat-channels-videos"
import type { OpportunityItem } from "../contracts/types"
import type { SearchAdapter, PlatformSearchInput, PlatformSearchOutput } from "./adapter-interface"

const log = logger.child({ component: "WechatChannelsSearchAdapter" })

/**
 * 视频号内容机会搜索。
 * 实际优先级在 searchWechatChannelsVideos：RedFox → TikHub。
 */
export class WechatChannelsSearchAdapter implements SearchAdapter {
  readonly platform = "wechat_channels" as const

  async search(input: PlatformSearchInput): Promise<PlatformSearchOutput> {
    const start = Date.now()

    try {
      const data = await searchWechatChannelsVideos({
        keyword: input.keyword,
        count: input.count,
        sortType:
          input.filters?.sortOrder === "latest"
            ? "latest"
            : input.filters?.sortOrder === "popular"
              ? "popular"
              : "comprehensive",
      })

      const items = data.list.slice(0, input.count).map((item) => this.normalize(item))
      return { platform: this.platform, status: "ok", items, durationMs: Date.now() - start }
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频号搜索失败"
      log.error({ err, keyword: input.keyword }, "视频号搜索失败")
      return {
        platform: this.platform,
        status: "error",
        items: [],
        error: message,
        durationMs: Date.now() - start,
      }
    }
  }

  private normalize(item: {
    object_id: string
    video_id: string
    description: string
    title: string
    cover_url: string
    work_url?: string
    share_url?: string
    create_time: number
    duration: number
    play_count: number | null
    like_count: number
    comment_count: number
    share_count: number
    collect_count: number
    nickname: string
    finder_username: string
  }): OpportunityItem {
    const sourceId = item.object_id || item.video_id
    const title = item.description || item.title
    const sourceUrl =
      item.work_url ||
      item.share_url ||
      (sourceId ? `https://channels.weixin.qq.com/video/${sourceId}` : "")

    return {
      platform: "wechat_channels",
      sourceId,
      sourceUrl,
      title,
      coverUrl: item.cover_url || undefined,
      author: {
        id: item.finder_username,
        name: item.nickname,
      },
      publishedAt: item.create_time
        ? new Date(item.create_time * 1000).toISOString()
        : undefined,
      durationSeconds: item.duration ? Math.round(item.duration / 1000) : undefined,
      metrics: {
        views: item.play_count ?? undefined,
        likes: item.like_count,
        comments: item.comment_count,
        shares: item.share_count,
        collects: item.collect_count,
      },
      scoreConfidence: "medium",
    }
  }
}

import { tikhubGet } from '../client'
import type {
  PlatformAdapter,
  NormalizedAccount,
  NormalizedVideo,
  NormalizedComment,
  VideoStats,
} from '../types'
import { fetchFromLocalCrawler, LocalCrawlerResult } from '../../competitor-analysis/local-crawler'
import { logger } from '@/lib/logger'

const adapterLog = logger.child({ component: 'DouyinAdapter' })

// ─── Internal Wire Types (not exported) ─────────────────

interface DouyinSecUserIdData {
  sec_user_id: string
}

interface DouyinAvatarThumb {
  url_list: string[]
}

interface DouyinUser {
  uid: string
  nickname: string
  avatar_thumb: DouyinAvatarThumb
  signature?: string
  follower_count?: number
  following_count?: number
  total_favorited?: number | string
  aweme_count?: number
  custom_verify?: string
  enterprise_verify_reason?: string
}

interface DouyinProfileData {
  user: DouyinUser
}

interface DouyinVideoAddress {
  url_list?: string[]
}

interface DouyinVideoCover {
  url_list?: string[]
}

interface DouyinVideoMedia {
  cover?: DouyinVideoCover
  play_addr?: DouyinVideoAddress
  duration?: number
}

interface DouyinVideoStatistics {
  play_count?: number
  digg_count?: number
  comment_count?: number
  share_count?: number
  collect_count?: number
}

interface DouyinAwemeItem {
  aweme_id: string
  desc?: string
  video?: DouyinVideoMedia
  create_time: number
  statistics?: DouyinVideoStatistics
}

interface DouyinPostVideosData {
  aweme_list: DouyinAwemeItem[]
  max_cursor: number
  has_more: 0 | 1
}

interface DouyinVideoStatItem {
  aweme_id: string
  statistics: DouyinVideoStatistics
}

interface DouyinMultiVideoStatsData {
  aweme_details: DouyinVideoStatItem[]
}

interface DouyinCommentItem {
  cid: string
  text?: string
  digg_count?: number
  create_time: number
  stick_position?: number
}

interface DouyinCommentsData {
  comments: DouyinCommentItem[]
}

// ─── Crawler Shared Memory Cache ─────────────────────────
// 本地爬虫单次运行缓存，防止重复拉取浏览器造成卡顿和内存泄漏
const localCrawlerCache = new Map<string, LocalCrawlerResult>()

// ─── DouyinAdapter ───────────────────────────────────────

export class DouyinAdapter implements PlatformAdapter {
  constructor(private readonly options: { localFallback?: boolean } = {}) {}

  private canUseLocalFallback(): boolean {
    return this.options.localFallback !== false
  }

  private isTikHubEnabled(): boolean {
    return !!process.env.TIKHUB_API_KEY
  }

  /**
   * 探测抖音短链并重定向获取真实主页 URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    if (!url.includes('v.douyin.com')) {
      return url
    }
    try {
      adapterLog.info({ url }, '检测到抖音分享短链，正在进行 302 物理探测...')
      const res = await fetch(url, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
        }
      })
      const location = res.headers.get('location')
      if (location) {
        adapterLog.info({ location }, '抖音短链 302 探测成功，获取到真实长链')
        return location
      }
    } catch (err) {
      adapterLog.warn({ err, url }, '抖音短链 302 探测异常，将采用直接返回原链兜底')
    }
    return url
  }

  /**
   * Resolves any Douyin URL to its canonical sec_user_id.
   * 支持 TikHub 解析与本地短链重定向+正则自适应降级提取。
   */
  async resolveUrl(url: string): Promise<string> {
    if (this.isTikHubEnabled()) {
      try {
        const data = await tikhubGet<DouyinSecUserIdData | string>(
          '/api/v1/douyin/web/get_sec_user_id',
          { url },
        )
        const secUserId = typeof data === 'string' ? data : data.sec_user_id
        if (!secUserId) {
          throw new Error('TikHub 未返回 sec_user_id')
        }
        return secUserId
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 解析 sec_user_id 失败，将自适应降级至本地正则与探测解析模式')
      }
    }

    if (!this.canUseLocalFallback()) {
      throw new Error('TikHub 解析 sec_user_id 失败，且当前调用禁用了本地浏览器兜底')
    }

    // 本地降级解析模式
    const realUrl = await this.resolveShortUrl(url)
    const match = realUrl.match(/\/user\/([A-Za-z0-9_-]+)/)
    const secUserId = match ? match[1] : null

    if (!secUserId) {
      throw new Error(`[LocalResolver] 无法从输入的链接中解析出抖音 sec_user_id：${realUrl}。请确认输入的是抖音个人主页分享链接。`)
    }

    adapterLog.info({ secUserId }, '本地降级解析 sec_user_id 成功')
    return secUserId
  }

  /**
   * 触发本地爬虫进行一次全量拦截抓取，并存入单次内存缓存中
   */
  private async ensureLocalCache(userId: string): Promise<LocalCrawlerResult> {
    if (localCrawlerCache.has(userId)) {
      return localCrawlerCache.get(userId)!
    }

    adapterLog.info({ userId }, '本地降级缓存未命中，启动本地 Python-Playwright 爬虫进行数据采集')
    
    // 自适应拼装主页物理 URL
    const targetUrl = `https://www.douyin.com/user/${userId}`
    const crawlResult = await fetchFromLocalCrawler('douyin', targetUrl, 50)
    
    localCrawlerCache.set(userId, crawlResult)
    return crawlResult
  }

  /**
   * Fetches the Douyin user profile and normalizes it to NormalizedAccount.
   */
  async fetchAccount(userId: string): Promise<NormalizedAccount> {
    if (this.isTikHubEnabled()) {
      try {
        const data = await tikhubGet<DouyinProfileData>(
          '/api/v1/douyin/app/v3/handler_user_profile',
          { sec_user_id: userId },
        )

        const user = data.user

        return {
          platformUserId: user.uid,
          nickname: user.nickname,
          avatar: user.avatar_thumb?.url_list?.[0] ?? '',
          signature: user.signature ?? '',
          followerCount: user.follower_count ?? 0,
          followingCount: user.following_count ?? 0,
          totalLikes: Number(user.total_favorited) || 0,
          videoCount: user.aweme_count ?? 0,
          isVerified: Boolean(user.custom_verify || user.enterprise_verify_reason),
          verifyInfo: user.custom_verify ?? user.enterprise_verify_reason ?? '',
        }
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 获取博主信息失败，将自动降级至本地爬虫')
      }
    }

    if (!this.canUseLocalFallback()) {
      throw new Error('TikHub 获取博主信息失败，且当前调用禁用了本地浏览器兜底')
    }

    // 本地爬虫自适应接管
    const cache = await this.ensureLocalCache(userId)
    return cache.account
  }

  /**
   * Fetches up to `count` videos for the given sec_user_id.
   */
  async fetchVideos(userId: string, count: number): Promise<NormalizedVideo[]> {
    if (this.isTikHubEnabled()) {
      try {
        const PAGE_SIZE = 20
        const results: NormalizedVideo[] = []
        let maxCursor = 0
        let hasMore = 1 as 0 | 1

        while (results.length < count && hasMore === 1) {
          const data = await tikhubGet<DouyinPostVideosData>(
            '/api/v1/douyin/app/v3/fetch_user_post_videos',
            {
              sec_user_id: userId,
              count: PAGE_SIZE,
              max_cursor: maxCursor,
            },
          )

          const items = data.aweme_list ?? []

          for (const item of items) {
            results.push({
              videoId: item.aweme_id,
              title: item.desc ?? '',
              coverUrl: item.video?.cover?.url_list?.[0] ?? '',
              videoUrl: item.video?.play_addr?.url_list?.[0] ?? '',
              createTime: item.create_time,
              duration: Math.round((item.video?.duration ?? 0) / 1000),
              views: item.statistics?.play_count ?? 0,
              likes: item.statistics?.digg_count ?? 0,
              comments: item.statistics?.comment_count ?? 0,
              shares: item.statistics?.share_count ?? 0,
              collects: item.statistics?.collect_count ?? 0,
            })
          }

          hasMore = data.has_more
          maxCursor = data.max_cursor
        }

        return results.slice(0, count)
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 获取视频列表失败，将自动降级至本地爬虫')
      }
    }

    if (!this.canUseLocalFallback()) {
      throw new Error('TikHub 获取视频列表失败，且当前调用禁用了本地浏览器兜底')
    }

    // 本地爬虫降级接管
    const cache = await this.ensureLocalCache(userId)
    return cache.videos.slice(0, count)
  }

  /**
   * Fetches batch video statistics.
   */
  async fetchVideoStats(videoIds: string[]): Promise<Map<string, VideoStats>> {
    if (this.isTikHubEnabled()) {
      try {
        const statsMap = new Map<string, VideoStats>()

        if (videoIds.length === 0) {
          return statsMap
        }

        const BATCH_SIZE = 50
        const chunks: string[][] = []

        for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
          chunks.push(videoIds.slice(i, i + BATCH_SIZE))
        }

        for (const chunk of chunks) {
          const data = await tikhubGet<DouyinMultiVideoStatsData>(
            '/api/v1/douyin/app/v3/fetch_multi_video_statistics',
            { aweme_ids: chunk.join(',') },
          )

          for (const item of data.aweme_details ?? []) {
            statsMap.set(item.aweme_id, {
              views: item.statistics?.play_count ?? 0,
              likes: item.statistics?.digg_count ?? 0,
              comments: item.statistics?.comment_count ?? 0,
              shares: item.statistics?.share_count ?? 0,
              collects: item.statistics?.collect_count ?? 0,
            })
          }
        }

        return statsMap
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 批量获取视频统计失败，将自动降级至本地缓存提取')
      }
    }

    if (!this.canUseLocalFallback()) {
      throw new Error('TikHub 批量获取视频统计失败，且当前调用禁用了本地浏览器兜底')
    }

    // 本地爬虫降级接管：直接从缓存的作品中反查交互数据
    const statsMap = new Map<string, VideoStats>()
    for (const cache of localCrawlerCache.values()) {
      for (const v of cache.videos) {
        if (videoIds.includes(v.videoId)) {
          statsMap.set(v.videoId, {
            views: v.views,
            likes: v.likes,
            comments: v.comments,
            shares: v.shares,
            collects: v.collects
          })
        }
      }
    }
    return statsMap
  }

  /**
   * Fetches up to `count` comments for a video.
   */
  async fetchComments(videoId: string, count: number): Promise<NormalizedComment[]> {
    if (this.isTikHubEnabled()) {
      try {
        const data = await tikhubGet<DouyinCommentsData>(
          '/api/v1/douyin/web/fetch_video_comments',
          {
            aweme_id: videoId,
            count: Math.min(count, 20),
            cursor: 0,
          },
        )

        const comments = data.comments ?? []

        return comments
          .map(
            (item): NormalizedComment => ({
              commentId: item.cid,
              text: item.text ?? '',
              likes: item.digg_count ?? 0,
              createTime: item.create_time,
              isTop: (item.stick_position ?? 0) > 0,
            }),
          )
          .slice(0, count)
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 获取评论列表失败，将自动降级至本地缓存提取')
      }
    }

    if (!this.canUseLocalFallback()) {
      throw new Error('TikHub 获取评论列表失败，且当前调用禁用了本地浏览器兜底')
    }

    // 本地爬虫降级接管：直接从已深度抓取的置顶评论缓存中进行过滤返回
    for (const cache of localCrawlerCache.values()) {
      type CachedComment = (typeof cache.comments)[number] & { videoId?: string }
      const matchComments = cache.comments.filter(
        (c): c is CachedComment => (c as { videoId?: string }).videoId === videoId,
      )
      if (matchComments.length > 0) {
        adapterLog.info({ videoId, count: matchComments.length }, '从本地爬虫评论缓存中成功提取评论数据')
        return matchComments.slice(0, count)
      }
    }

    return []
  }
}

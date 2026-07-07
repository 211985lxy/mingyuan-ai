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

const adapterLog = logger.child({ component: 'XiaohongshuAdapter' })

// ─── Internal Wire Types ─────────────────────────────────

interface XhsResolveUrlData {
  user_id: string
  xsec_token: string
}

interface XhsTagItem {
  name: string
}

interface XhsUserInfoData {
  user_id: string
  nickname?: string
  avatar?: string
  desc?: string
  follows?: string | number
  fans?: string | number
  interaction?: string | number
  tag_list?: XhsTagItem[]
}

interface XhsCoverItem {
  url?: string
  url_default?: string
}

interface XhsInteractInfo {
  liked_count?: number
  comment_count?: number
  share_count?: number
  collected_count?: number
}

interface XhsNoteItem {
  note_id: string
  display_title?: string
  title?: string
  cover?: XhsCoverItem
  time: number
  interact_info?: XhsInteractInfo
}

interface XhsNotesPageData {
  notes: XhsNoteItem[]
  cursor: string
  has_more: boolean
}

interface XhsFeedNoteInteractInfo {
  viewed_count?: number
  liked_count?: number
  comment_count?: number
  shared_count?: number
  collected_count?: number
}

interface XhsFeedNoteItem {
  note_id: string
  interact_info?: XhsFeedNoteInteractInfo
}

interface XhsFeedNotesData {
  notes: XhsFeedNoteItem[]
}

interface XhsCommentItem {
  id: string
  content?: string
  like_count?: number
  create_time: number
  pinned?: boolean
}

interface XhsCommentsData {
  comments: XhsCommentItem[]
}

// ─── Crawler Shared Memory Cache ─────────────────────────
const localCrawlerCache = new Map<string, LocalCrawlerResult>()

// ─── XiaohongshuAdapter ──────────────────────────────────

export class XiaohongshuAdapter implements PlatformAdapter {
  private isTikHubEnabled(): boolean {
    return !!process.env.TIKHUB_API_KEY
  }

  /**
   * 探测小红书短链并重定向获取真实主页 URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    if (!url.includes('xhslink.com') && !url.includes('xiaohongshu.com/discovery/item')) {
      return url
    }
    try {
      adapterLog.info({ url }, '检测到小红书分享短链，正在进行 302 物理探测...')
      const res = await fetch(url, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
        }
      })
      const location = res.headers.get('location')
      if (location) {
        adapterLog.info({ location }, '小红书短链 302 探测成功，获取到真实长链')
        return location
      }
    } catch (err) {
      adapterLog.warn({ err, url }, '小红书短链 302 探测异常，将采用直接返回原链兜底')
    }
    return url
  }

  /**
   * Resolve a Xiaohongshu profile URL to a user_id.
   * 支持 TikHub 解析与本地短链重定向+正则自适应降级提取。
   */
  async resolveUrl(url: string): Promise<string> {
    if (this.isTikHubEnabled()) {
      try {
        const data = await tikhubGet<XhsResolveUrlData>(
          '/api/v1/xiaohongshu/app/get_user_id_and_xsec_token',
          { url },
        )
        return data.user_id
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 解析小红书 user_id 失败，将降级至本地正则与探测解析模式')
      }
    }

    // 本地降级解析模式
    const realUrl = await this.resolveShortUrl(url)
    const match = realUrl.match(/\/user\/profile\/([A-Za-z0-9_-]+)/)
    const userId = match ? match[1] : null

    if (!userId) {
      throw new Error(`[LocalResolver] 无法从输入链接中解析出小红书 user_id：${realUrl}。请确认输入的是小红书个人主页分享链接。`)
    }

    adapterLog.info({ userId }, '本地降级解析小红书 user_id 成功')
    return userId
  }

  /**
   * 确保本地抓取缓存命中
   */
  private async ensureLocalCache(userId: string): Promise<LocalCrawlerResult> {
    if (localCrawlerCache.has(userId)) {
      return localCrawlerCache.get(userId)!
    }

    adapterLog.info({ userId }, '本地降级缓存未命中，启动本地 Python-Playwright 爬虫进行数据采集')
    const targetUrl = `https://www.xiaohongshu.com/user/profile/${userId}`
    const crawlResult = await fetchFromLocalCrawler('xiaohongshu', targetUrl, 50)
    
    localCrawlerCache.set(userId, crawlResult)
    return crawlResult
  }

  /**
   * Fetch account profile and normalize to NormalizedAccount.
   */
  async fetchAccount(userId: string): Promise<NormalizedAccount> {
    if (this.isTikHubEnabled()) {
      try {
        const data = await tikhubGet<XhsUserInfoData>(
          '/api/v1/xiaohongshu/app_v2/get_user_info',
          { user_id: userId },
        )

        return {
          platformUserId: data.user_id,
          nickname: data.nickname ?? '',
          avatar: data.avatar ?? '',
          signature: data.desc ?? '',
          followerCount: Number(data.fans) || 0,
          followingCount: Number(data.follows) || 0,
          totalLikes: Number(data.interaction) || 0,
          videoCount: 0,
          isVerified: Array.isArray(data.tag_list) && data.tag_list.length > 0,
          verifyInfo: data.tag_list?.[0]?.name ?? '',
        }
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 获取小红书博主信息失败，将自动降级至本地爬虫')
      }
    }

    // 本地爬虫降级接管
    const cache = await this.ensureLocalCache(userId)
    return cache.account
  }

  /**
   * Fetch published notes for a user, cursor-paginated up to count.
   */
  async fetchVideos(userId: string, count: number): Promise<NormalizedVideo[]> {
    if (this.isTikHubEnabled()) {
      try {
        const results: NormalizedVideo[] = []
        let cursor = ''

        while (results.length < count) {
          const data = await tikhubGet<XhsNotesPageData>(
            '/api/v1/xiaohongshu/app_v2/get_user_posted_notes',
            { user_id: userId, cursor, num: 20 },
          )

          if (!data.notes || data.notes.length === 0) break

          for (const item of data.notes) {
            results.push({
              videoId: item.note_id,
              title: item.display_title ?? item.title ?? '',
              coverUrl: item.cover?.url ?? item.cover?.url_default ?? '',
              videoUrl: '',
              createTime: item.time,
              duration: 0,
              views: 0,
              likes: item.interact_info?.liked_count ?? 0,
              comments: item.interact_info?.comment_count ?? 0,
              shares: item.interact_info?.share_count ?? 0,
              collects: item.interact_info?.collected_count ?? 0,
            })
          }

          if (!data.has_more || results.length >= count) {
            break
          }

          cursor = data.cursor
        }

        return results.slice(0, count)
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 获取小红书笔记列表失败，将自动降级至本地爬虫')
      }
    }

    // 本地爬虫降级接管
    const cache = await this.ensureLocalCache(userId)
    return cache.videos.slice(0, count)
  }

  /**
   * Fetch note stats for a batch of note IDs.
   */
  async fetchVideoStats(videoIds: string[]): Promise<Map<string, VideoStats>> {
    if (this.isTikHubEnabled()) {
      try {
        const statsMap = new Map<string, VideoStats>()

        if (videoIds.length === 0) {
          return statsMap
        }

        const BATCH_SIZE = 20
        for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
          const batch = videoIds.slice(i, i + BATCH_SIZE)
          const data = await tikhubGet<XhsFeedNotesData>(
            '/api/v1/xiaohongshu/web_v2/fetch_feed_notes_v2',
            { note_ids: batch.join(',') },
          )

          for (const item of data.notes) {
            statsMap.set(item.note_id, {
              views: item.interact_info?.viewed_count ?? 0,
              likes: item.interact_info?.liked_count ?? 0,
              comments: item.interact_info?.comment_count ?? 0,
              shares: item.interact_info?.shared_count ?? 0,
              collects: item.interact_info?.collected_count ?? 0,
            })
          }
        }

        return statsMap
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 获取小红书笔记批量指标数据失败，自动降级为本地缓存反查')
      }
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
   * Fetch comments for a note.
   */
  async fetchComments(videoId: string, count: number): Promise<NormalizedComment[]> {
    if (this.isTikHubEnabled()) {
      try {
        const data = await tikhubGet<XhsCommentsData>(
          '/api/v1/xiaohongshu/web/fetch_note_comments',
          {
            note_id: videoId,
            count: Math.min(count, 20),
            cursor: '',
          },
        )

        const comments = data.comments ?? []

        return comments
          .map(
            (item): NormalizedComment => ({
              commentId: item.id,
              text: item.content ?? '',
              likes: item.like_count ?? 0,
              createTime: item.create_time,
              isTop: Boolean(item.pinned),
            }),
          )
          .slice(0, count)
      } catch (err) {
        adapterLog.warn({ err }, 'TikHub 获取小红书笔记评论失败，将自动降级至本地缓存提取')
      }
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

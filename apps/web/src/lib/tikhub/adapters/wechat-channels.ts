import { tikhubGet } from '../client'
import type {
  PlatformAdapter,
  NormalizedAccount,
  NormalizedVideo,
  NormalizedComment,
  VideoStats,
} from '../types'
import { logger } from '@/lib/logger'

const adapterLog = logger.child({ component: 'WechatChannelsAdapter' })

// ─── Internal Wire Types (TikHub WeChat Channels V2 API) ───

interface WxChannelsAccountData {
  finder_username?: string
  nickname?: string
  avatar_url?: string
  head_url?: string
  signature?: string
  description?: string
  follower_count?: number
  fans_count?: number
  following_count?: number
  video_count?: number
  feed_count?: number
  likes_count?: number
  total_like_count?: number
  is_verified?: boolean
  verification_info?: string
  verification_text?: string
}

interface WxChannelsVideoItem {
  object_id?: string
  video_id?: string
  feed_id?: string
  description?: string
  title?: string
  cover_url?: string
  thumb_url?: string
  video_url?: string
  media_url?: string
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
}

interface WxChannelsUserVideosData {
  list?: WxChannelsVideoItem[]
  video_list?: WxChannelsVideoItem[]
  cursor?: string
  next_cursor?: string
  has_more?: boolean | number
  continue_flag?: number
}

interface WxChannelsCommentItem {
  comment_id?: string
  content?: string
  text?: string
  like_count?: number
  digg_count?: number
  create_time?: number
  is_top?: boolean
  is_hot?: boolean
}

interface WxChannelsCommentsData {
  comments?: WxChannelsCommentItem[]
  comment_list?: WxChannelsCommentItem[]
  cursor?: string
  has_more?: boolean | number
}

interface WxChannelsVideoDetailData {
  object_id?: string
  video_id?: string
  play_count?: number
  read_count?: number
  like_count?: number
  recommend_count?: number
  comment_count?: number
  share_count?: number
  forward_count?: number
  collect_count?: number
  fav_count?: number
}

// ─── 合集相关 Wire Types ───

export interface WxChannelsCollection {
  collectionId: string
  title: string
  coverUrl: string
  videoCount: number
  description: string
}

export interface WxChannelsCollectionListData {
  list?: Array<{
    collection_id?: string
    mix_id?: string
    title?: string
    name?: string
    cover_url?: string
    thumb_url?: string
    video_count?: number
    feed_count?: number
    description?: string
    intro?: string
  }>
  cursor?: string
  has_more?: boolean | number
}

export interface WxChannelsCollectionVideosData {
  list?: WxChannelsVideoItem[]
  video_list?: WxChannelsVideoItem[]
  cursor?: string
  has_more?: boolean | number
}

// ─── 直播回放相关 Wire Types ───

export interface WxChannelsLiveReplay {
  replayId: string
  title: string
  coverUrl: string
  startTime: number
  endTime: number
  duration: number
  viewCount: number
  likeCount: number
  commentCount: number
}

interface WxChannelsLiveReplayListData {
  list?: Array<{
    replay_id?: string
    live_id?: string
    feed_id?: string
    title?: string
    description?: string
    cover_url?: string
    thumb_url?: string
    start_time?: number
    create_time?: number
    end_time?: number
    duration?: number
    view_count?: number
    watch_count?: number
    play_count?: number
    like_count?: number
    comment_count?: number
  }>
  replay_list?: Array<{
    replay_id?: string
    live_id?: string
    feed_id?: string
    title?: string
    description?: string
    cover_url?: string
    thumb_url?: string
    start_time?: number
    create_time?: number
    end_time?: number
    duration?: number
    view_count?: number
    watch_count?: number
    play_count?: number
    like_count?: number
    comment_count?: number
  }>
  cursor?: string
  has_more?: boolean | number
}

// ─── WechatChannelsAdapter ──────────────────────────────

export class WechatChannelsAdapter implements PlatformAdapter {
  /**
   * Resolves a WeChat Channels URL to its finder_username.
   * TikHub V2 暂无专用 URL 解析端点，直接从 URL 路径提取。
   * 如果传入的已经是 finder_username（非 URL），直接返回。
   */
  async resolveUrl(url: string): Promise<string> {
    // 如果不是 URL，假设已经是 finder_username
    if (!url.startsWith('http')) {
      return url
    }

    try {
      const parsed = new URL(url)
      const segments = parsed.pathname.split('/').filter(Boolean)

      // channels.weixin.qq.com/web/pages/profile/<finder_username>
      const pagesIdx = segments.indexOf('pages')
      if (pagesIdx !== -1 && segments[pagesIdx + 2]) {
        return segments[pagesIdx + 2]
      }

      // finder.video.qq.com/mfinder/<finder_username>
      const finderIdx = segments.indexOf('mfinder')
      if (finderIdx !== -1 && segments[finderIdx + 1]) {
        return segments[finderIdx + 1]
      }

      // 兜底：取最后一段路径
      const lastSegment = segments[segments.length - 1]
      if (lastSegment) {
        return lastSegment
      }
    } catch {
      // URL 解析失败，原样返回
    }

    throw new Error(
      `[WechatChannels] 无法从输入的链接中解析出视频号 finder_username：${url}。请确认输入的是视频号主页链接或直接输入视频号账号名。`
    )
  }

  /**
   * Fetches the WeChat Channels account profile.
   */
  async fetchAccount(userId: string): Promise<NormalizedAccount> {
    const data = await tikhubGet<WxChannelsAccountData>(
      '/api/v1/wechat/channels/v2/get_account_info',
      { finder_username: userId },
    )

    return {
      platformUserId: data.finder_username ?? userId,
      nickname: data.nickname ?? '未知视频号',
      avatar: data.avatar_url ?? data.head_url ?? '',
      signature: data.signature ?? data.description ?? '',
      followerCount: data.follower_count ?? data.fans_count ?? 0,
      followingCount: data.following_count ?? 0,
      totalLikes: data.likes_count ?? data.total_like_count ?? 0,
      videoCount: data.video_count ?? data.feed_count ?? 0,
      isVerified: data.is_verified ?? Boolean(data.verification_info),
      verifyInfo: data.verification_info ?? data.verification_text ?? '',
    }
  }

  /**
   * Fetches up to `count` videos for the given finder_username.
   */
  async fetchVideos(userId: string, count: number): Promise<NormalizedVideo[]> {
    const PAGE_SIZE = 20
    const results: NormalizedVideo[] = []
    let cursor = ''
    let hasMore = true

    while (results.length < count && hasMore) {
      const params: Record<string, string | number> = {
        finder_username: userId,
        count: PAGE_SIZE,
      }
      if (cursor) {
        params.cursor = cursor
      }

      const data = await tikhubGet<WxChannelsUserVideosData>(
        '/api/v1/wechat/channels/v2/get_user_videos',
        params,
      )

      const items = data.list ?? data.video_list ?? []

      for (const item of items) {
        results.push(this.normalizeVideo(item))
      }

      cursor = data.cursor ?? data.next_cursor ?? ''
      hasMore = Boolean(data.has_more ?? data.continue_flag === 1) && items.length > 0
    }

    return results.slice(0, count)
  }

  /**
   * Fetches batch video statistics.
   * 视频号无批量统计端点，逐条获取详情。
   */
  async fetchVideoStats(videoIds: string[]): Promise<Map<string, VideoStats>> {
    const statsMap = new Map<string, VideoStats>()

    // 视频号 API 无批量接口，限制并发逐条获取
    const BATCH_LIMIT = 10
    const ids = videoIds.slice(0, BATCH_LIMIT)

    for (const videoId of ids) {
      try {
        const data = await tikhubGet<WxChannelsVideoDetailData>(
          '/api/v1/wechat/channels/v2/get_video_detail',
          { object_id: videoId },
        )

        statsMap.set(videoId, {
          views: data.play_count ?? data.read_count ?? 0,
          likes: data.like_count ?? data.recommend_count ?? 0,
          comments: data.comment_count ?? 0,
          shares: data.share_count ?? data.forward_count ?? 0,
          collects: data.collect_count ?? data.fav_count ?? 0,
        })
      } catch (err) {
        adapterLog.warn({ err, videoId }, 'TikHub 获取视频号视频详情失败，跳过')
      }
    }

    return statsMap
  }

  /**
   * Fetches up to `count` comments for a video.
   */
  async fetchComments(videoId: string, count: number): Promise<NormalizedComment[]> {
    const data = await tikhubGet<WxChannelsCommentsData>(
      '/api/v1/wechat/channels/v2/get_video_comments',
      {
        object_id: videoId,
        count: Math.min(count, 20),
      },
    )

    const comments = data.comments ?? data.comment_list ?? []

    return comments
      .map(
        (item): NormalizedComment => ({
          commentId: item.comment_id ?? '',
          text: item.content ?? item.text ?? '',
          likes: item.like_count ?? item.digg_count ?? 0,
          createTime: item.create_time ?? 0,
          isTop: item.is_top ?? item.is_hot ?? false,
        }),
      )
      .filter((c) => c.commentId !== '')
      .slice(0, count)
  }

  // ─── 合集 API（Phase 3）───────────────────────────────

  /**
   * 获取视频号账号的合集列表。
   */
  async fetchCollections(finderUsername: string): Promise<WxChannelsCollection[]> {
    const data = await tikhubGet<WxChannelsCollectionListData>(
      '/api/v1/wechat/channels/v2/get_collections',
      { finder_username: finderUsername },
    )

    const items = data.list ?? []
    return items.map((item) => ({
      collectionId: item.collection_id ?? item.mix_id ?? '',
      title: item.title ?? item.name ?? '',
      coverUrl: item.cover_url ?? item.thumb_url ?? '',
      videoCount: item.video_count ?? item.feed_count ?? 0,
      description: item.description ?? item.intro ?? '',
    })).filter((c) => c.collectionId !== '')
  }

  /**
   * 获取合集内视频列表。
   */
  async fetchCollectionVideos(collectionId: string, count = 20): Promise<NormalizedVideo[]> {
    const data = await tikhubGet<WxChannelsCollectionVideosData>(
      '/api/v1/wechat/channels/v2/get_collection_videos',
      { collection_id: collectionId, count },
    )

    const items = data.list ?? data.video_list ?? []
    return items.map((item) => this.normalizeVideo(item)).slice(0, count)
  }

  // ─── 直播回放 API（探索性）───────────────────────

  /**
   * 获取视频号账号的直播回放列表。
   */
  async fetchLiveReplays(finderUsername: string, count = 20): Promise<WxChannelsLiveReplay[]> {
    const data = await tikhubGet<WxChannelsLiveReplayListData>(
      '/api/v1/wechat/channels/v2/get_live_replays',
      { finder_username: finderUsername, count },
    )

    const items = data.list ?? data.replay_list ?? []
    return items.map((item) => ({
      replayId: item.replay_id ?? item.live_id ?? item.feed_id ?? '',
      title: item.title ?? item.description ?? '',
      coverUrl: item.cover_url ?? item.thumb_url ?? '',
      startTime: item.start_time ?? item.create_time ?? 0,
      endTime: item.end_time ?? 0,
      duration: item.duration ?? 0,
      viewCount: item.view_count ?? item.watch_count ?? item.play_count ?? 0,
      likeCount: item.like_count ?? 0,
      commentCount: item.comment_count ?? 0,
    })).filter((r) => r.replayId !== '').slice(0, count)
  }

  // ─── Private Helpers ────────────────────────────────────

  private normalizeVideo(item: WxChannelsVideoItem): NormalizedVideo {
    return {
      videoId: item.object_id ?? item.video_id ?? item.feed_id ?? '',
      title: item.description ?? item.title ?? '',
      coverUrl: item.cover_url ?? item.thumb_url ?? '',
      videoUrl: item.video_url ?? item.media_url ?? '',
      createTime: item.create_time ?? item.publish_time ?? 0,
      duration: item.duration ?? 0,
      views: item.play_count ?? item.read_count ?? 0,
      likes: item.like_count ?? item.recommend_count ?? 0,
      comments: item.comment_count ?? 0,
      shares: item.share_count ?? item.forward_count ?? 0,
      collects: item.collect_count ?? item.fav_count ?? 0,
    }
  }
}

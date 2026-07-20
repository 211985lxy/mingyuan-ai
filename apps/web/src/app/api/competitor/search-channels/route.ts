import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { tikhubGet } from "@/lib/tikhub/client"
import { redis } from "@/lib/redis"
import { searchChannelsVideoBodySchema } from "@/features/competitor/contracts/api"

const CACHE_TTL = 30 * 60 // 30 minutes

// ─── Wire Types ───

interface SearchVideoItem {
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

interface SearchVideoResult {
  list?: SearchVideoItem[]
  video_list?: SearchVideoItem[]
  cursor?: string
  next_cursor?: string
  has_more?: boolean | number
}

/**
 * POST /api/competitor/search-channels
 * 搜索视频号视频（选题热度分析）
 */
export const POST = withUserAuth(async (request, { user: _user }) => {
  const body = await parseJsonBody(request, searchChannelsVideoBodySchema, { maxBytes: 4 * 1024 })

  const sortTypeMap: Record<string, string> = {
    comprehensive: '0',
    latest: '1',
    popular: '2',
  }

  const cacheKey = `wx_channels:search_video:${body.keyword}:${body.sortType || 'default'}:${body.cursor || '0'}`

  // 尝试读取缓存
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return NextResponse.json(JSON.parse(cached))
  } catch { /* Redis 不可用时降级 */ }

  try {
    const data = await tikhubGet<SearchVideoResult>(
      '/api/v1/wechat/search/v2/search_channels_video',
      {
        keyword: body.keyword,
        cursor: body.cursor || undefined,
        count: body.count,
        sort_type: body.sortType ? sortTypeMap[body.sortType] : undefined,
      },
    )

    const items = data.list ?? data.video_list ?? []

    const videos = items.map((item) => ({
      videoId: item.object_id ?? item.video_id ?? '',
      title: item.description ?? item.title ?? '',
      coverUrl: item.cover_url ?? item.thumb_url ?? '',
      createTime: item.create_time ?? item.publish_time ?? 0,
      duration: item.duration ?? 0,
      views: item.play_count ?? item.read_count ?? 0,
      likes: item.like_count ?? item.recommend_count ?? 0,
      comments: item.comment_count ?? 0,
      shares: item.share_count ?? item.forward_count ?? 0,
      collects: item.collect_count ?? item.fav_count ?? 0,
      author: {
        nickname: item.nickname ?? '',
        finderUsername: item.finder_username ?? '',
        avatar: item.avatar_url ?? '',
      },
    }))

    const result = {
      videos,
      cursor: data.cursor ?? data.next_cursor ?? '',
      hasMore: Boolean(data.has_more),
    }

    // 写入缓存（30min）
    try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL) } catch { /* ignore */ }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : '搜索视频号视频失败'
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

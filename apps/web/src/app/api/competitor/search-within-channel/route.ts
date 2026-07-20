import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { tikhubGet } from "@/lib/tikhub/client"
import { redis } from "@/lib/redis"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"

const bodySchema = z.object({
  finderUsername: z.string().trim().min(1).max(200),
  keyword: z.string().trim().min(1).max(200),
  cursor: z.string().trim().max(200).optional(),
}).strict()

interface SearchWithinChannelItem {
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
}

interface SearchWithinChannelResult {
  list?: SearchWithinChannelItem[]
  video_list?: SearchWithinChannelItem[]
  cursor?: string
  has_more?: boolean | number
}

const CACHE_TTL = 30 * 60 // 30 minutes

/**
 * POST /api/competitor/search-within-channel
 * 视频号号内搜索（在指定账号内按关键词搜索视频）
 */
export const POST = withUserAuth(async (request, { user: _user }) => {
  const body = await parseJsonBody(request, bodySchema, { maxBytes: 4 * 1024 })

  const cacheKey = `wx_channels:search_within:${body.finderUsername}:${body.keyword}:${body.cursor || '0'}`

  // 尝试读取缓存
  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      return NextResponse.json(JSON.parse(cached))
    }
  } catch { /* Redis 不可用时降级 */ }

  try {
    const data = await tikhubGet<SearchWithinChannelResult>(
      '/api/v1/wechat/channels/v2/search_within_channel',
      {
        finder_username: body.finderUsername,
        keyword: body.keyword,
        cursor: body.cursor || undefined,
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
    }))

    const result = {
      videos,
      cursor: data.cursor ?? '',
      hasMore: Boolean(data.has_more),
    }

    // 写入缓存（30min）
    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL)
    } catch { /* Redis 不可用时忽略 */ }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : '号内搜索失败'
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

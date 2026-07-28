import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { redis } from "@/lib/redis"
import { searchChannelsVideoBodySchema } from "@/features/competitor/contracts/api"
import { searchWechatChannelsVideos } from "@/lib/tikhub/search-wechat-channels-videos"

const CACHE_TTL = 30 * 60 // 30 minutes

/**
 * POST /api/competitor/search-channels
 * 搜索视频号视频（选题热度分析）
 */
export const POST = withUserAuth(async (request, { user: _user }) => {
  const body = await parseJsonBody(request, searchChannelsVideoBodySchema, { maxBytes: 4 * 1024 })

  const cacheKey = `wx_channels:search_video:v2:${body.keyword}:${body.sortType || 'default'}:${body.cursor || '0'}`

  try {
    const cached = await redis.get(cacheKey)
    if (cached) return NextResponse.json(JSON.parse(cached))
  } catch { /* Redis 不可用时降级 */ }

  try {
    const data = await searchWechatChannelsVideos({
      keyword: body.keyword,
      cursor: body.cursor || undefined,
      count: body.count,
      sortType: body.sortType,
    })

    const videos = data.list.map((item) => ({
      videoId: item.object_id || item.video_id,
      title: item.description || item.title,
      coverUrl: item.cover_url,
      createTime: item.create_time,
      duration: item.duration,
      views: item.play_count,
      likes: item.like_count,
      comments: item.comment_count,
      shares: item.share_count,
      collects: item.collect_count,
      author: {
        nickname: item.nickname,
        finderUsername: item.finder_username,
        avatar: item.avatar_url,
      },
    }))

    const result = {
      videos,
      cursor: data.cursor,
      hasMore: data.has_more,
    }

    try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL) } catch { /* ignore */ }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : '搜索视频号视频失败'
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

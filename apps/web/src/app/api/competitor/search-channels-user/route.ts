import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { tikhubGet } from "@/lib/tikhub/client"
import { searchChannelsUserBodySchema } from "@/features/competitor/contracts/api"

// ─── Wire Types ───

interface SearchUserItem {
  finder_username?: string
  nickname?: string
  avatar_url?: string
  head_url?: string
  signature?: string
  description?: string
  follower_count?: number
  fans_count?: number
  video_count?: number
  feed_count?: number
  is_verified?: boolean
  verification_info?: string
}

interface SearchUserResult {
  list?: SearchUserItem[]
  user_list?: SearchUserItem[]
  cursor?: string
  next_cursor?: string
  has_more?: boolean | number
}

/**
 * POST /api/competitor/search-channels-user
 * 搜索视频号账号（按关键词查找账号）
 */
export const POST = withUserAuth(async (request, { user: _user }) => {
  const body = await parseJsonBody(request, searchChannelsUserBodySchema, { maxBytes: 4 * 1024 })

  try {
    const data = await tikhubGet<SearchUserResult>(
      '/api/v1/wechat/channels/v2/search_user',
      {
        keyword: body.keyword,
        cursor: body.cursor || undefined,
      },
    )

    const items = data.list ?? data.user_list ?? []

    const users = items.map((item) => ({
      finderUsername: item.finder_username ?? '',
      nickname: item.nickname ?? '',
      avatar: item.avatar_url ?? item.head_url ?? '',
      signature: item.signature ?? item.description ?? '',
      followerCount: item.follower_count ?? item.fans_count ?? 0,
      videoCount: item.video_count ?? item.feed_count ?? 0,
      isVerified: item.is_verified ?? Boolean(item.verification_info),
    }))

    return NextResponse.json({
      users,
      cursor: data.cursor ?? data.next_cursor ?? '',
      hasMore: Boolean(data.has_more),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '搜索视频号账号失败'
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

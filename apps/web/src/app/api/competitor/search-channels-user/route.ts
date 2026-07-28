import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { searchChannelsUserBodySchema } from "@/features/competitor/contracts/api"
import { searchWechatChannelsUsers } from "@/lib/tikhub/search-wechat-channels-users"

/**
 * POST /api/competitor/search-channels-user
 * 搜索视频号账号（按关键词查找账号）
 */
export const POST = withUserAuth(async (request, { user: _user }) => {
  const body = await parseJsonBody(request, searchChannelsUserBodySchema, { maxBytes: 4 * 1024 })

  try {
    const data = await searchWechatChannelsUsers({
      keyword: body.keyword,
      cursor: body.cursor,
    })

    const users = data.list.map((item) => ({
      finderUsername: item.finder_username,
      nickname: item.nickname,
      avatar: item.avatar_url,
      signature: item.signature,
      followerCount: item.follower_count,
      videoCount: item.video_count,
      isVerified: item.is_verified,
    }))

    return NextResponse.json({
      users,
      cursor: data.cursor,
      hasMore: data.has_more,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "搜索视频号账号失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

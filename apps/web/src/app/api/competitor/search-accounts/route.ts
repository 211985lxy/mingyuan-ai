import { NextResponse } from "next/server"

import { parseJsonBody } from "@/lib/api-contract"
import { searchChannelsUserBodySchema } from "@/features/competitor/contracts/api"
import { buildWechatChannelsProfileUrl } from "@/features/competitor/competitor-url-utils"
import { searchDouyinUsers } from "@/lib/tikhub/search-douyin-users"
import { searchWechatChannelsUsers } from "@/lib/tikhub/search-wechat-channels-users"
import { withUserAuth } from "@/lib/user-auth"

export const POST = withUserAuth(async (request) => {
  const body = await parseJsonBody(request, searchChannelsUserBodySchema, { maxBytes: 4 * 1024 })
  const [douyin, channels] = await Promise.allSettled([
    searchDouyinUsers(body.keyword),
    searchWechatChannelsUsers({ keyword: body.keyword }),
  ])

  if (douyin.status === "rejected" && channels.status === "rejected") {
    return NextResponse.json({ error: "抖音和视频号账号搜索暂时不可用，请稍后重试" }, { status: 502 })
  }

  const douyinAccounts = douyin.status === "fulfilled"
    ? douyin.value.slice(0, 8).map((item) => ({
          platform: "douyin" as const,
          platformUserId: item.secUserId,
          targetUrl: `https://www.douyin.com/user/${item.secUserId}`,
          nickname: item.nickname,
          avatar: item.avatarUrl,
          signature: item.category,
          followerCount: item.followerCount,
          videoCount: item.videoCount,
          isVerified: false,
        }))
    : []
  const channelsAccounts = channels.status === "fulfilled"
    ? channels.value.list.slice(0, 8).map((item) => ({
          platform: "wechat_channels" as const,
          platformUserId: item.finder_username,
          targetUrl: buildWechatChannelsProfileUrl(item.finder_username),
          nickname: item.nickname,
          avatar: item.avatar_url,
          signature: item.signature,
          followerCount: item.follower_count,
          videoCount: item.video_count,
          isVerified: item.is_verified,
        }))
    : []
  const accounts = Array.from(
    { length: Math.max(douyinAccounts.length, channelsAccounts.length) },
    (_, index) => [douyinAccounts[index], channelsAccounts[index]].filter(Boolean),
  ).flat()

  return NextResponse.json({
    accounts,
    partial: douyin.status === "rejected" || channels.status === "rejected",
  })
})

import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { WechatChannelsAdapter } from "@/lib/tikhub/adapters"

/**
 * GET /api/competitor/channels-collections/videos?collectionId=xxx&count=20
 * 获取视频号合集内视频列表（选题系列分析）
 */
export const GET = withUserAuth(async (request, { user: _user }) => {
  const { searchParams } = new URL(request.url)
  const collectionId = searchParams.get('collectionId')?.trim()
  const count = Math.min(Number(searchParams.get('count')) || 20, 50)

  if (!collectionId) {
    return NextResponse.json({ error: '缺少 collectionId 参数' }, { status: 400 })
  }

  try {
    const adapter = new WechatChannelsAdapter()
    const videos = await adapter.fetchCollectionVideos(collectionId, count)

    return NextResponse.json({
      collectionId,
      videos,
      total: videos.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取合集视频失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

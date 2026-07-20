import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { WechatChannelsAdapter } from "@/lib/tikhub/adapters"

/**
 * GET /api/competitor/channels-live-replays?finderUsername=xxx&count=20
 * 获取视频号账号的直播回放列表（探索性功能）
 */
export const GET = withUserAuth(async (request, { user: _user }) => {
  const { searchParams } = new URL(request.url)
  const finderUsername = searchParams.get('finderUsername')?.trim()
  const count = Math.min(Number(searchParams.get('count')) || 20, 50)

  if (!finderUsername) {
    return NextResponse.json({ error: '缺少 finderUsername 参数' }, { status: 400 })
  }

  try {
    const adapter = new WechatChannelsAdapter()
    const replays = await adapter.fetchLiveReplays(finderUsername, count)

    return NextResponse.json({
      finderUsername,
      replays,
      total: replays.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取直播回放失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

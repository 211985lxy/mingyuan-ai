import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { WechatChannelsAdapter } from "@/lib/tikhub/adapters"

/**
 * GET /api/competitor/channels-collections?finderUsername=xxx
 * 获取视频号账号的合集列表（映射为"选题系列"）
 */
export const GET = withUserAuth(async (request, { user: _user }) => {
  const { searchParams } = new URL(request.url)
  const finderUsername = searchParams.get('finderUsername')?.trim()

  if (!finderUsername) {
    return NextResponse.json({ error: '缺少 finderUsername 参数' }, { status: 400 })
  }

  try {
    const adapter = new WechatChannelsAdapter()
    const collections = await adapter.fetchCollections(finderUsername)

    return NextResponse.json({
      finderUsername,
      collections,
      total: collections.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取视频号合集失败'
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

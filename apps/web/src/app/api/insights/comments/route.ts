import { NextRequest, NextResponse } from "next/server"
import { fetchRedFoxComments } from "@/lib/redfox"
import { withUserAuth } from "@/lib/user-auth"

/**
 * GET /api/insights/comments?platform=douyin&itemId=xxx&cursor=0
 *
 * 拉取单条作品/笔记的评论（用户主动触发）。
 * 不自动批量采集，避免成本和限流失控。
 *
 * 鉴权：需登录态。该端点会调用 RedFox 付费 API 消耗额度，
 * 若匿名放行将导致配额被恶意耗尽（DoS / 经济攻击）。
 */
export const GET = withUserAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get("platform") as "douyin" | "xiaohongshu" | null
  const itemId = searchParams.get("itemId")
  const cursorRaw = searchParams.get("cursor")

  if (!platform || !["douyin", "xiaohongshu"].includes(platform)) {
    return NextResponse.json({ error: "请指定有效的平台（douyin | xiaohongshu）" }, { status: 400 })
  }

  if (!itemId) {
    return NextResponse.json({ error: "请提供作品或笔记 ID" }, { status: 400 })
  }

  // cursor 解析：抖音用数字，小红书用字符串
  const cursorOrOffset = cursorRaw ? (platform === "douyin" ? Number(cursorRaw) : cursorRaw) : undefined

  try {
    const page = await fetchRedFoxComments({
      platform,
      itemId,
      cursorOrOffset,
    })
    return NextResponse.json(page)
  } catch (err) {
    const message = err instanceof Error ? err.message : "评论拉取失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { fetchRedFoxTrendingTop10, hasTrendingApi } from "@/lib/redfox"

/**
 * GET /api/trending/redfox
 *
 * 获取全网热榜 TOP10（7大平台聚合）。
 * Redis 缓存 70min，避免频繁调用。
 */
export const GET = withUserAuth(async () => {
  if (!hasTrendingApi()) {
    return NextResponse.json(
      { error: "RedFox API 未配置，无法获取全网热榜", items: [], source: "unavailable" },
      { status: 503 },
    )
  }

  try {
    const result = await fetchRedFoxTrendingTop10()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "全网热榜获取失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

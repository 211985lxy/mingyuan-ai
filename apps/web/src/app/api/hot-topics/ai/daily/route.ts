import { NextResponse } from "next/server"
import { AIHOT_USER_AGENT } from "@/lib/aihot-constants"

const AIHOT_BASE = "https://aihot.virxact.com/api/public"

// In-memory cache: 5min TTL for daily (changes once per day)
let cache: { key: string; data: unknown; expires: number } | null = null
const CACHE_TTL = 5 * 60_000

function getCache(key: string): unknown | null {
  if (cache && cache.key === key && Date.now() < cache.expires) return cache.data
  return null
}

function setCache(key: string, data: unknown) {
  cache = { key, data, expires: Date.now() + CACHE_TTL }
}

/**
 * @description 处理 GET 请求
 * @returns 无返回值
 */
export async function GET() {
  const cacheKey = "daily:latest"
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json({ data: cached })

  try {
    const res = await fetch(`${AIHOT_BASE}/daily`, {
      headers: { "User-Agent": AIHOT_USER_AGENT },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return NextResponse.json(
        { error: body?.error || `AIHOT upstream error: ${res.status}` },
        { status: res.status === 404 ? 404 : 502 }
      )
    }

    const data = await res.json()
    setCache(cacheKey, data)
    return NextResponse.json({ data })
  } catch (err) {
    console.error("[AIHOT daily] fetch failed:", err)
    return NextResponse.json(
      { error: "AI 日报服务暂时不可用，请稍后重试" },
      { status: 502 }
    )
  }
}

import { NextResponse } from "next/server"
import { AIHOT_USER_AGENT } from "@/lib/aihot-constants"

const AIHOT_BASE = "https://aihot.virxact.com/api/public"

// In-memory cache: 30s TTL
let cache: { key: string; data: unknown; expires: number } | null = null
const CACHE_TTL = 30_000

function getCache(key: string): unknown | null {
  if (cache && cache.key === key && Date.now() < cache.expires) return cache.data
  return null
}

function setCache(key: string, data: unknown) {
  cache = { key, data, expires: Date.now() + CACHE_TTL }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // Build proxy query string — only pass allowed params
  const allowed = new Set(["mode", "category", "since", "take", "cursor", "q"])
  const qs: string[] = []
  for (const [k, v] of searchParams.entries()) {
    if (allowed.has(k)) qs.push(`${k}=${encodeURIComponent(v)}`)
  }

  // Defaults
  if (!searchParams.has("mode")) qs.push("mode=selected")
  if (!searchParams.has("take")) qs.push("take=50")

  const cacheKey = qs.join("&")
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json({ data: cached })

  const url = `${AIHOT_BASE}/items?${qs.join("&")}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": AIHOT_USER_AGENT },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return NextResponse.json(
        { error: body?.error || `AIHOT upstream error: ${res.status}` },
        { status: res.status === 429 ? 429 : 502 }
      )
    }

    const data = await res.json()
    setCache(cacheKey, data)
    return NextResponse.json({ data })
  } catch (err) {
    console.error("[AIHOT proxy] fetch failed:", err)
    return NextResponse.json(
      { error: "AI 热点服务暂时不可用，请稍后重试" },
      { status: 502 }
    )
  }
}

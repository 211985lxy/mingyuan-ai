import { redis } from "./redis"
import { AIHOT_USER_AGENT } from "@/lib/aihot-constants"

export interface AiHotItem {
  id: string
  title: string
  title_en?: string | null
  url: string
  source: string
  publishedAt?: string | null
  summary?: string | null
  category?: "ai-models" | "ai-products" | "industry" | "paper" | "tip" | "creator" | null
}

export interface AiHotResponse {
  count: number
  hasNext: boolean
  nextCursor: string | null
  items: AiHotItem[]
}

const CACHE_KEY = "aihot:cache:selected"
const ETAG_KEY = "aihot:etag:selected"

// In-memory fallback
let memoryEtag: string | null = null
let memoryData: AiHotResponse | null = null

export async function fetchAiHotSelectedItems(): Promise<AiHotResponse> {
  let cachedEtag: string | null = null
  let cachedData: AiHotResponse | null = null

  try {
    cachedEtag = await redis.get(ETAG_KEY)
    const dataStr = await redis.get(CACHE_KEY)
    if (dataStr) {
      cachedData = JSON.parse(dataStr) as AiHotResponse
    }
  } catch (e) {
    console.warn("Redis unavailable for AI HOT client, using memory cache:", (e as Error).message)
    cachedEtag = memoryEtag
    cachedData = memoryData
  }

  const headers: Record<string, string> = {
    "User-Agent": AIHOT_USER_AGENT,
  }

  if (cachedEtag) {
    headers["If-None-Match"] = cachedEtag
  }

  try {
    const res = await fetch("https://aihot.virxact.com/api/public/items?mode=selected&take=50", {
      headers,
      signal: AbortSignal.timeout(10000),
    })

    if (res.status === 304) {
      if (cachedData) {
        return cachedData
      }
      // If we got 304 but somehow cache is missing, clear ETag and fetch again
      console.warn("Got 304 but no cached data found. Re-fetching...")
      const retryRes = await fetch("https://aihot.virxact.com/api/public/items?mode=selected&take=50", {
        headers: { "User-Agent": AIHOT_USER_AGENT },
        signal: AbortSignal.timeout(10000),
      })
      if (!retryRes.ok) throw new Error(`AI HOT retry returned ${retryRes.status}`)
      const retryJson = (await retryRes.json()) as AiHotResponse
      await updateCache(retryJson, retryRes.headers.get("etag"))
      return retryJson
    }

    if (!res.ok) {
      if (cachedData) {
        console.warn(`AI HOT returned ${res.status}, falling back to cached data.`)
        return cachedData
      }
      throw new Error(`AI HOT returned status ${res.status}`)
    }

    const json = (await res.json()) as AiHotResponse
    const newEtag = res.headers.get("etag")
    await updateCache(json, newEtag)

    return json
  } catch (error) {
    if (cachedData) {
      console.warn("Fetch AI HOT failed, falling back to cached data:", (error as Error).message)
      return cachedData
    }
    throw error
  }
}

async function updateCache(data: AiHotResponse, etag: string | null) {
  memoryData = data
  if (etag) {
    memoryEtag = etag
  }

  try {
    if (etag) {
      await redis.setex(ETAG_KEY, 86400, etag) // 1 day
    }
    await redis.setex(CACHE_KEY, 3600, JSON.stringify(data)) // 1 hour
  } catch {
    // Ignore Redis writing error, memory fallback is already updated
  }

}

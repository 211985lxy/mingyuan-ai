import { env } from "@/env"
import { prisma } from "./prisma"
import { redis } from "./redis"
import type { HotTopic } from "@/types/content-template"

const CACHE_KEY = "douyin:hot:latest"
const CACHE_TTL = 70 * 60 // 70 minutes

const PRIMARY_URL =
  env.DOUYIN_HOT_PRIMARY_URL || "https://v2.xxapi.cn/api/douyinhot"
const FALLBACK_URL =
  env.DOUYIN_HOT_FALLBACK_URL ||
  "https://api.vvhan.com/api/hotlist/douyinHot"

// ─── Raw API response types ──────────────────────────────

interface XxapiItem {
  word: string
  hot_value: number
  position: number
  sentence_id: string
  group_id: string
  label: number
  event_time: number
  video_count: number
  discuss_video_count: number
  word_cover: { uri: string; url_list: string[] } | null
  word_type: number
  sentence_tag: number
  display_style: number
  can_extend_detail: boolean
  hotlist_param: string
  word_sub_board: number[] | null
  related_words: string[] | null
  article_detail_count: number
}

interface VvhanItem {
  index: number
  title: string
  hot: string
  url: string
  mobilUrl: string
}

// ─── Normalized internal type ────────────────────────────

interface NormalizedItem {
  sentenceId: string
  word: string
  hotValue: number
  position: number
  label: number
  videoCount: number
  discussCount: number
  coverUrl: string | null
  eventTime: Date
}

// ─── Fetchers ────────────────────────────────────────────

async function fetchFromXxapi(): Promise<NormalizedItem[]> {
  const res = await fetch(PRIMARY_URL, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`xxapi returned ${res.status}`)
  const json = await res.json()
  if (json.code !== 200 || !Array.isArray(json.data)) {
    throw new Error("xxapi invalid response format")
  }
  return (json.data as XxapiItem[]).map((item, i) => ({
    sentenceId: item.sentence_id || String(i),
    word: item.word,
    hotValue: item.hot_value,
    position: item.position ?? i + 1,
    label: item.label ?? 0,
    videoCount: item.video_count ?? 0,
    discussCount: item.discuss_video_count ?? 0,
    coverUrl: item.word_cover?.url_list?.[0] ?? null,
    eventTime: new Date(item.event_time * 1000),
  }))
}

async function fetchFromVvhan(): Promise<NormalizedItem[]> {
  const res = await fetch(FALLBACK_URL, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`vvhan returned ${res.status}`)
  const json = await res.json()
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error("vvhan invalid response format")
  }
  return (json.data as VvhanItem[]).map((item, i) => ({
    sentenceId: String(item.index || i),
    word: item.title,
    hotValue: parseInt(item.hot, 10) || 0,
    position: item.index ?? i + 1,
    label: 0,
    videoCount: 0,
    discussCount: 0,
    coverUrl: null,
    eventTime: new Date(),
  }))
}

async function fetchWithFallback(): Promise<NormalizedItem[]> {
  try {
    return await fetchFromXxapi()
  } catch (e) {
    console.warn("xxapi failed, falling back to vvhan:", (e as Error).message)
    try {
      return await fetchFromVvhan()
    } catch (e2) {
      console.error("All hot list sources failed:", (e2 as Error).message)
      throw new Error("DOUYIN_HOT_FETCH_FAILED")
    }
  }
}

// ─── Storage ─────────────────────────────────────────────

async function storeBatch(
  batchId: string,
  items: NormalizedItem[]
): Promise<void> {
  // Use createMany with skipDuplicates for bulk insert
  await prisma.douyinHotItem.createMany({
    data: items.map((item) => ({
      sentenceId: item.sentenceId,
      word: item.word,
      hotValue: item.hotValue,
      position: item.position,
      label: item.label,
      videoCount: item.videoCount,
      discussCount: item.discussCount,
      coverUrl: item.coverUrl,
      eventTime: item.eventTime,
      batchId,
    })),
    skipDuplicates: true,
  })
}

async function cacheLatest(items: NormalizedItem[]): Promise<void> {
  const hotTopics: HotTopic[] = items.map((item) => ({
    id: item.sentenceId,
    rank: item.position,
    title: item.word,
    hotValue: item.hotValue,
    label: labelToString(item.label),
    videoCount: item.videoCount,
    coverUrl: item.coverUrl,
    douyinSearchUrl: `https://www.douyin.com/search/${encodeURIComponent(item.word)}`,
    fetchedAt: new Date().toISOString(),
  }))
  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(hotTopics))
}

function labelToString(
  label: number
): "normal" | "new" | "hot" | "recommended" {
  switch (label) {
    case 1:
      return "new"
    case 2:
      return "hot"
    case 3:
      return "recommended"
    default:
      return "normal"
  }
}

// ─── Public API ──────────────────────────────────────────

export async function fetchAndStore(): Promise<{
  batchId: string
  itemCount: number
}> {
  const batchId = `batch_${Date.now()}`
  let items: NormalizedItem[] = []
  let status = "success"

  try {
    items = await fetchWithFallback()
    await storeBatch(batchId, items)
    await cacheLatest(items)
  } catch {
    status = "failed"
  }

  await prisma.douyinHotSnapshot.create({
    data: {
      batchId,
      itemCount: items.length,
      status,
    },
  })

  return { batchId, itemCount: items.length }
}

export async function getLatestHotList(): Promise<HotTopic[]> {
  // Try Redis cache first
  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached) as HotTopic[]
  } catch {
    // Redis unavailable, fall through to DB
  }

  // Fallback: query most recent batch from DB
  const latestSnapshot = await prisma.douyinHotSnapshot.findFirst({
    where: { status: "success" },
    orderBy: { fetchedAt: "desc" },
  })
  if (!latestSnapshot) return []

  const items = await prisma.douyinHotItem.findMany({
    where: { batchId: latestSnapshot.batchId },
    orderBy: { position: "asc" },
  })

  return items.map((item) => ({
    id: item.sentenceId,
    rank: item.position,
    title: item.word,
    hotValue: item.hotValue,
    label: labelToString(item.label),
    videoCount: item.videoCount,
    coverUrl: item.coverUrl,
    douyinSearchUrl: `https://www.douyin.com/search/${encodeURIComponent(item.word)}`,
    fetchedAt: item.fetchedAt.toISOString(),
  }))
}

import { AIHOT_USER_AGENT } from "@/lib/aihot-constants"
import type { AiHotItem } from "@/lib/aihot-client"

const AI_NEWS_RADAR_LATEST_URL = "https://learnprompt.github.io/ai-news-radar/data/latest-24h.json"
const CREATOR_ITEM_LIMIT = 6

type CreatorMetrics = {
  likes?: number
  comments?: number
  collects?: number
  shares?: number
}

type AiNewsRadarCreatorItem = {
  id?: string
  site_id?: string
  site_name?: string
  source?: string
  title?: string
  title_zh?: string
  title_bilingual?: string
  url?: string
  published_at?: string | null
  first_seen_at?: string | null
  creator_metrics?: CreatorMetrics
}

type AiNewsRadarLatest = {
  creator_items_ai?: AiNewsRadarCreatorItem[]
  creator_items_all?: AiNewsRadarCreatorItem[]
}

export async function fetchAiNewsRadarCreatorItems(fetchImpl: typeof fetch = fetch): Promise<AiHotItem[]> {
  const res = await fetchImpl(AI_NEWS_RADAR_LATEST_URL, {
    headers: { "User-Agent": AIHOT_USER_AGENT },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    throw new Error(`AI News Radar returned ${res.status}`)
  }

  const data = (await res.json()) as AiNewsRadarLatest
  const rawItems = Array.isArray(data.creator_items_ai) && data.creator_items_ai.length > 0
    ? data.creator_items_ai
    : data.creator_items_all ?? []

  const usedKeys = new Set<string>()
  const items: AiHotItem[] = []

  for (const rawItem of rawItems) {
    const item = toAiHotItem(rawItem)
    if (!item) continue

    const key = `${item.title}:${item.source}`.toLowerCase()
    if (usedKeys.has(key)) continue

    usedKeys.add(key)
    items.push(item)
    if (items.length >= CREATOR_ITEM_LIMIT) break
  }

  return items
}

function toAiHotItem(item: AiNewsRadarCreatorItem): AiHotItem | null {
  const title = (item.title_zh || item.title_bilingual || item.title || "").trim()
  const url = (item.url || "").trim()
  if (!title || !url) return null

  const platform = platformLabel(item.site_id, item.site_name)
  const creator = item.source || item.site_name || "自媒体源"

  return {
    id: `ai-news-radar-${item.id || encodeURIComponent(`${creator}-${title}`)}`,
    title,
    url,
    source: `${platform}｜${creator}`,
    publishedAt: item.published_at || item.first_seen_at || null,
    summary: buildCreatorSummary(platform, creator, item.creator_metrics),
    category: "creator",
  }
}

function platformLabel(siteId?: string, siteName?: string) {
  if (siteId === "tikhub_douyin") return "抖音"
  if (siteId === "tikhub_xiaohongshu") return "小红书"
  if (siteId === "socialdata_x") return "X/Twitter"
  return siteName || "自媒体"
}

function buildCreatorSummary(platform: string, creator: string, metrics?: CreatorMetrics) {
  const metricText = formatMetrics(metrics)
  if (!metricText) return `来自 ${platform} 账号「${creator}」的自媒体热榜内容，可用于观察标题、钩子和观点表达。`
  return `来自 ${platform} 账号「${creator}」的自媒体热榜内容，互动数据：${metricText}。`
}

function formatMetrics(metrics?: CreatorMetrics) {
  if (!metrics) return ""

  const parts = [
    ["赞", metrics.likes],
    ["评", metrics.comments],
    ["藏", metrics.collects],
    ["转", metrics.shares],
  ]
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([label, value]) => `${label}${formatCompactNumber(value)}`)

  return parts.join(" / ")
}

function formatCompactNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  return String(value)
}

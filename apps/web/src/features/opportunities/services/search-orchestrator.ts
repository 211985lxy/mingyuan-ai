import { createHash } from "node:crypto"
import { logger } from "@/lib/logger"
import { redis } from "@/lib/redis"
import type {
  AggregatedSearchResult,
  OpportunityItem,
  OpportunityPlatform,
  PlatformSearchResult,
  SearchFilters,
  SearchParams,
} from "../contracts/types"
import type { SearchAdapter } from "../adapters/adapter-interface"
import { DouyinSearchAdapter } from "../adapters/douyin-search"
import { WechatChannelsSearchAdapter } from "../adapters/wechat-channels-search"
import { scoreOpportunityItems } from "./opportunity-scoring"

const log = logger.child({ component: "SearchOrchestrator" })

const PLATFORM_TIMEOUT_MS = 15_000
const CACHE_TTL_SECONDS = 6 * 60 * 60 // 6 hours

// ─── Adapter Registry ────────────────────────────────────

const adapters: Record<OpportunityPlatform, SearchAdapter> = {
  douyin: new DouyinSearchAdapter(),
  wechat_channels: new WechatChannelsSearchAdapter(),
}

// ─── Orchestrator ────────────────────────────────────────

export async function executeSearch(params: SearchParams): Promise<AggregatedSearchResult> {
  const platforms = params.platforms ?? ["douyin", "wechat_channels"]
  const count = params.count ?? 20

  // Check cache
  const cacheKey = buildCacheKey(params)
  const cached = await readCache(cacheKey)
  if (cached) return cached

  // Parallel platform search with individual timeouts
  const platformPromises = platforms.map((platform) =>
    searchPlatform(platform, params, count),
  )

  const platformResults = await Promise.all(platformPromises)

  // Merge items
  const allItems = platformResults.flatMap((r) => r.items)

  // Deduplicate across platforms (title similarity)
  const deduped = deduplicateItems(allItems)

  // Apply client-side filters
  const filtered = applyClientFilters(deduped, params.filters)

  // Score items
  const scored = scoreOpportunityItems(filtered, params.keyword)

  // Sort by score descending
  scored.sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))

  // Build warnings
  const warnings: string[] = []
  for (const pr of platformResults) {
    if (pr.status === "timeout") {
      warnings.push(`${platformLabel(pr.platform)}搜索超时，已返回其他平台结果`)
    } else if (pr.status === "error") {
      warnings.push(`${platformLabel(pr.platform)}搜索失败：${pr.error || "未知错误"}`)
    }
  }

  const result: AggregatedSearchResult = {
    items: scored.slice(0, count),
    platformResults,
    total: scored.length,
    hasMore: platformResults.some((r) => r.hasMore),
    warnings,
  }

  // Write cache (fire-and-forget)
  writeCache(cacheKey, result).catch(() => {})

  return result
}

// ─── Platform Search with Timeout ────────────────────────

async function searchPlatform(
  platform: OpportunityPlatform,
  params: SearchParams,
  count: number,
): Promise<PlatformSearchResult> {
  const adapter = adapters[platform]
  const start = Date.now()

  try {
    const result = await withTimeout(
      adapter.searchVideos({
        keyword: params.keyword,
        count,
        cursor: params.cursor,
        filters: params.filters,
      }),
      PLATFORM_TIMEOUT_MS,
    )

    return {
      platform,
      status: "ok",
      items: result.items,
      cursor: result.cursor,
      hasMore: result.hasMore,
      total: result.total,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes("timeout")
    const error = err instanceof Error ? err.message : "未知错误"
    log.warn({ err, platform, keyword: params.keyword }, "平台搜索失败")

    return {
      platform,
      status: isTimeout ? "timeout" : "error",
      items: [],
      error,
      durationMs: Date.now() - start,
    }
  }
}

// ─── Deduplication ───────────────────────────────────────

function deduplicateItems(items: OpportunityItem[]): OpportunityItem[] {
  const seen = new Map<string, OpportunityItem>()

  for (const item of items) {
    const key = normalizeTitle(item.title)
    if (!key) {
      seen.set(item.sourceId, item)
      continue
    }

    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, item)
    } else {
      // Keep the one with more metrics data
      const existingScore = countAvailableMetrics(existing)
      const newScore = countAvailableMetrics(item)
      if (newScore > existingScore) {
        seen.set(key, item)
      }
    }
  }

  return [...seen.values()]
}

function normalizeTitle(title: string): string {
  return title
    .replace(/[#@]\S+/g, "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "")
    .toLowerCase()
    .slice(0, 40)
}

function countAvailableMetrics(item: OpportunityItem): number {
  const m = item.metrics
  return [m.views, m.likes, m.comments, m.shares, m.collects].filter(
    (v) => v !== undefined && v > 0,
  ).length
}

// ─── Client-side Filters ─────────────────────────────────

function applyClientFilters(
  items: OpportunityItem[],
  filters?: SearchFilters,
): OpportunityItem[] {
  if (!filters) return items

  return items.filter((item) => {
    if (filters.durationMin && (item.durationSeconds ?? 0) < filters.durationMin) return false
    if (filters.durationMax && (item.durationSeconds ?? Infinity) > filters.durationMax) return false
    if (filters.followerMin && (item.author.followerCount ?? 0) < filters.followerMin) return false
    if (filters.followerMax && (item.author.followerCount ?? Infinity) > filters.followerMax) return false
    if (filters.viewsMin && (item.metrics.views ?? 0) < filters.viewsMin) return false
    if (filters.likesMin && (item.metrics.likes ?? 0) < filters.likesMin) return false
    if (filters.commentsMin && (item.metrics.comments ?? 0) < filters.commentsMin) return false

    if (filters.lowFollowerViral) {
      const followers = item.author.followerCount ?? Infinity
      const likes = item.metrics.likes ?? 0
      if (followers > 10000 || likes < 1000) return false
    }

    if (filters.highEngagement) {
      const views = item.metrics.views ?? 0
      const interactions = (item.metrics.likes ?? 0) + (item.metrics.comments ?? 0) + (item.metrics.shares ?? 0)
      if (views > 0 && interactions / views < 0.05) return false
    }

    return true
  })
}

// ─── Cache ───────────────────────────────────────────────

function buildCacheKey(params: SearchParams): string {
  const raw = JSON.stringify({
    k: params.keyword,
    t: params.searchType ?? "video",
    p: (params.platforms ?? ["douyin", "wechat_channels"]).sort(),
    f: params.filters ?? {},
    c: params.count ?? 20,
  })
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 16)
  return `opp:search:${hash}`
}

async function readCache(key: string): Promise<AggregatedSearchResult | null> {
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as AggregatedSearchResult
  } catch {
    return null
  }
}

async function writeCache(key: string, result: AggregatedSearchResult): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(result), "EX", CACHE_TTL_SECONDS)
  } catch {
    // Redis unavailable — skip cache
  }
}

// ─── Utils ───────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Platform search timeout after ${ms}ms`)), ms),
    ),
  ])
}

function platformLabel(platform: OpportunityPlatform): string {
  return platform === "douyin" ? "抖音" : "视频号"
}

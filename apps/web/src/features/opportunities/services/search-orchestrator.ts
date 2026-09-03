import { createHash } from "node:crypto"
import { redis } from "@/lib/redis"
import { logger } from "@/lib/logger"
import type { OpportunityItem, SearchFilters, SearchResponse, OpportunityPlatform } from "../contracts/types"
import type { SearchAdapter } from "../adapters/adapter-interface"
import { DouyinSearchAdapter } from "../adapters/douyin-search"
import { WechatChannelsSearchAdapter } from "../adapters/wechat-channels-search"
import { scoreItems } from "./opportunity-scoring"

const log = logger.child({ component: "SearchOrchestrator" })

const CACHE_TTL = 6 * 60 * 60 // 6 hours
const PLATFORM_TIMEOUT_MS = 15_000

// ─── Adapter Registry ──────────────────────────────────────

const adapters: Record<OpportunityPlatform, SearchAdapter> = {
  douyin: new DouyinSearchAdapter(),
  wechat_channels: new WechatChannelsSearchAdapter(),
}

// ─── Main Entry ────────────────────────────────────────────

export interface OrchestratorInput {
  keyword: string
  platforms: OpportunityPlatform[]
  count: number
  filters?: SearchFilters
}

export async function orchestrateSearch(input: OrchestratorInput): Promise<SearchResponse> {
  // 1. 尝试缓存
  const cacheKey = buildCacheKey(input)
  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached) as SearchResponse
      return { ...parsed, cached: true }
    }
  } catch { /* Redis 不可用时降级 */ }

  // 2. 并行搜索各平台
  const results = await Promise.allSettled(
    input.platforms.map((platform) =>
      withTimeout(
        adapters[platform].search({
          keyword: input.keyword,
          count: input.count,
          filters: input.filters,
        }),
        PLATFORM_TIMEOUT_MS,
        platform,
      ),
    ),
  )

  // 3. 聚合结果
  const allItems: OpportunityItem[] = []
  const warnings: string[] = []
  const platformStatus: Record<string, "ok" | string> = {}

  results.forEach((result, idx) => {
    const platform = input.platforms[idx]
    if (result.status === "fulfilled") {
      const output = result.value
      platformStatus[platform] = output.status === "ok" ? "ok" : `error: ${output.error}`
      if (output.status === "ok") {
        allItems.push(...output.items)
      } else if (output.error) {
        warnings.push(`${platformLabel(platform)}：${output.error}`)
      }
    } else {
      platformStatus[platform] = `error: ${result.reason?.message ?? "超时"}`
      warnings.push(`${platformLabel(platform)}：搜索超时或异常`)
    }
  })

  // 4. 跨平台去重（标题归一化）
  const deduped = deduplicateByTitle(allItems)

  // 5. 客户端侧筛选
  const filtered = applyFilters(deduped, input.filters)

  // 6. 评分排序
  // 6. 评分排序（主排序仍由 weightedScore / opportunityScore 主导，不影响）
  const scored = scoreItems(filtered)

  // 6b. 用户问题命中标识透传：把 scoreBreakdown.userQuestionBoost / matchedQuestionIds
  //     复制到 item 顶层，前端无需穿透 scoreBreakdown 即可展示。
  const lifted = scored.map((item) => {
    const bd = item.scoreBreakdown
    if (!bd || (bd.userQuestionBoost !== true && !Array.isArray(bd.matchedQuestionIds))) {
      return item
    }
    return {
      ...item,
      ...(bd.userQuestionBoost === true ? { userQuestionBoost: true as const } : {}),
      ...(Array.isArray(bd.matchedQuestionIds) ? { matchedQuestionIds: bd.matchedQuestionIds } : {}),
    }
  })

  const response: SearchResponse = {
    items: lifted.slice(0, input.count),
    warnings,
    platformStatus,
  }

  // 7. 写入缓存
  try {
    await redis.set(cacheKey, JSON.stringify(response), "EX", CACHE_TTL)
  } catch { /* ignore */ }

  return response
}

// ─── Helpers ───────────────────────────────────────────────

function buildCacheKey(input: OrchestratorInput): string {
  const raw = JSON.stringify({
    k: input.keyword,
    p: input.platforms.sort(),
    c: input.count,
    f: input.filters ?? {},
  })
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 16)
  return `opp:search:${hash}`
}

function withTimeout<T>(promise: Promise<T>, ms: number, platform: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${platform} 搜索超时 (${ms}ms)`)), ms),
    ),
  ])
}

function deduplicateByTitle(items: OpportunityItem[]): OpportunityItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = normalizeTitle(item.title)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeTitle(title: string): string {
  return title
    .replace(/[#@【】\[\]｜|！!？?。，,、\s]+/g, "")
    .toLowerCase()
    .slice(0, 40)
}

function applyFilters(items: OpportunityItem[], filters?: SearchFilters): OpportunityItem[] {
  if (!filters) return items

  return items.filter((item) => {
    if (filters.minLikes != null && (item.metrics.likes ?? 0) < filters.minLikes) return false
    if (filters.minComments != null && (item.metrics.comments ?? 0) < filters.minComments) return false
    if (filters.maxDurationSeconds != null && item.durationSeconds != null && item.durationSeconds > filters.maxDurationSeconds) return false
    if (filters.minDurationSeconds != null && item.durationSeconds != null && item.durationSeconds < filters.minDurationSeconds) return false
    if (filters.lowFollowerViral) {
      const followers = item.author.followerCount
      const likes = item.metrics.likes ?? 0
      if (followers != null && followers > 50000) return false
      if (likes < 5000) return false
    }
    return true
  })
}

function platformLabel(platform: OpportunityPlatform): string {
  return platform === "douyin" ? "抖音" : "视频号"
}

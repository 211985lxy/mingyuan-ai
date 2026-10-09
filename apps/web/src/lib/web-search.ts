import { env } from "@/env"

/**
 * 全网搜索（共享层）。
 *
 * 为什么必须有这一层：Bing 的 `format=rss` 表面**已不可用**。微软退役 Bing Search API 后，
 * 该表面在大量查询上返回缓存垃圾，且各版式互不相同——实测（2026-09-16）：
 *
 * - 「某地暴雨内涝」→ 斗地主 / 欢乐斗地主 / 纸牌游戏
 * - 「教师节送礼引发争议」→ 教育考试网导航页、北京事业单位招聘公告
 * - 「空气源热泵群控」及其加引号短语、换词变体 → 同一批「空气/空气污染」百科页
 * - 而「特斯拉 财报」「asdfghjkl」→ 又完全正常
 *
 * 危险之处在于**它不报错**：任何"至少 N 条"的数量校验都会放行，调用方只会静默拿到
 * 无关内容（热点洞察曾据此生成"事实核实过的洞察"）。所以统一走 Tavily（付费、契约明确），
 * 并由配置决定开关——**没配 key 就明确返回不可用**，让调用方自己决定降级策略。
 *
 * 契约（Tavily /search，2026-09 核对官方文档）：
 *   POST https://api.tavily.com/search
 *   Authorization: Bearer <key>
 *   { query, max_results, search_depth: "basic" }
 *   → { results: [{ title, url, content, score, published_date }] }
 */

const SEARCH_URL = "https://api.tavily.com/search"
const SEARCH_TIMEOUT_MS = 8_000
/** basic 深度每次消耗 1 credit；advanced 是 2，这里不需要 */
const SEARCH_DEPTH = "basic"

export interface WebSearchHit {
  title: string
  url: string
  snippet: string
  publishedAt: string | null
}

/** 是否配置了可用的搜索能力；未配置时调用方应明确降级，而不是假装搜到 */
export function isWebSearchEnabled(): boolean {
  return Boolean(env.WEB_SEARCH_API_KEY?.trim())
}

/** 解析搜索结果：字段不全的条目直接丢弃（不做兜底假设），按 url 去重后按上限截断。 */
export function parseSearchResults(payload: unknown, limit: number): WebSearchHit[] {
  const results = (payload as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  const seen = new Set<string>()
  return results
    .map((raw) => {
      const hit = raw as { title?: unknown; url?: unknown; content?: unknown; published_date?: unknown }
      return {
        title: typeof hit?.title === "string" ? hit.title.trim() : "",
        url: typeof hit?.url === "string" ? hit.url.trim() : "",
        snippet: typeof hit?.content === "string" ? hit.content.replace(/\s+/g, " ").trim() : "",
        publishedAt: typeof hit?.published_date === "string" ? hit.published_date.slice(0, 10) : null,
      }
    })
    .filter((item) => item.title && item.url && item.snippet)
    .filter((item) => {
      if (seen.has(item.url)) return false
      seen.add(item.url)
      return true
    })
    .slice(0, limit)
}

/**
 * 执行一次搜索。未配置 key、非 200、超时、解析不出条目 —— 一律返回 null，不抛错。
 * 是否视为失败由调用方决定（热点洞察要求证据、选题只当增强信号，两者语义不同）。
 */
export async function runWebSearch(
  query: string,
  options: { limit: number },
): Promise<WebSearchHit[] | null> {
  const normalized = query?.trim()
  const apiKey = env.WEB_SEARCH_API_KEY?.trim()
  if (!normalized || !apiKey) return null

  try {
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: normalized,
        max_results: options.limit,
        search_depth: SEARCH_DEPTH,
      }),
    })
    if (!response.ok) return null

    const hits = parseSearchResults(await response.json(), options.limit)
    return hits.length > 0 ? hits : null
  } catch {
    return null
  }
}

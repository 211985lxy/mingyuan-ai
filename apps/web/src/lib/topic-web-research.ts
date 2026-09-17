import { env } from "@/env"
import type { TopicSource } from "@/lib/topic-source-builders"

/**
 * 选题联网线索（全网搜索）。
 *
 * 范围约定（2026-09-16 与业务确认）：**只在选题生成时搜索，写文案链路不接**——
 * 写稿的知识来源是项目知识库 / IP 档案 / 爆款库，联网搜索会拖慢出稿（链路本就在
 * 115 秒预算边缘）且把不可控噪声引成稿。
 *
 * 为什么用第三方付费搜索而不用免费表面：
 * 曾按 hot-topic-intelligence 的做法抓 Bing 的 `format=rss`（纯 HTTP、零成本），
 * 实测该表面已不可用——同一批查询里「空气源热泵群控」及其加引号短语、换词变体
 * 返回的是**完全相同的无关缓存结果**（空气/空气污染的百科页），而「特斯拉 财报」
 * 又正常。微软已退役 Bing Search API，该 RSS 表面返回缓存垃圾。
 * 与其喂噪声给模型，不如把开关交给配置：**没配 key 就不联网**。
 *
 * 契约（Tavily /search，2026-09 核对官方文档）：
 *   POST https://api.tavily.com/search
 *   Authorization: Bearer <key>
 *   { query, max_results, search_depth: "basic" }
 *   → { results: [{ title, url, content, score, published_date }] }
 */

const SEARCH_URL = "https://api.tavily.com/search"
const SEARCH_TIMEOUT_MS = 8_000
const SEARCH_LIMIT = 5
/** 单条摘要进 prompt 的上限：线索是入口不是正文，过长会挤占项目与对标信号 */
const SNIPPET_MAX_CHARS = 120
/** 整条 content 上限：超长会被 TopicSource 截断（180 字）反而砍掉条目，这里自己先压 */
const CONTENT_MAX_CHARS = 900

export interface TopicWebResearchInput {
  industry?: string | null
  targetCustomer?: string | null
  /** IP 档案内容支柱主题（按占比排序），取第一个非空词作为搜索词 */
  contentThemeNames?: string[]
}

/**
 * 构建搜索词（纯函数）：内容支柱主题 > 行业 > 目标客户。
 * 只取一个最具体的词——搜索词太宽泛返回噪声，太拼凑返回空白。
 */
export function buildTopicWebResearchQuery(input: TopicWebResearchInput): string | null {
  const candidates = [
    input.contentThemeNames?.find((name) => name.trim()),
    input.industry,
    input.targetCustomer,
  ]
  for (const candidate of candidates) {
    const text = candidate?.replace(/\s+/g, " ").trim()
    if (text && text.length >= 2) return text.slice(0, 40)
  }
  return null
}

/** 是否配置了搜索能力；未配置时选题阶段直接跳过联网。 */
export function isTopicWebResearchEnabled(): boolean {
  return Boolean(env.TOPIC_WEB_SEARCH_API_KEY?.trim())
}

interface SearchHit {
  title?: unknown
  url?: unknown
  content?: unknown
  published_date?: unknown
}

/** 解析 Tavily 响应；字段缺失或类型不对的条目直接丢弃，不做兜底假设。 */
export function parseTopicSearchResults(payload: unknown): Array<{
  title: string
  url: string
  snippet: string
  publishedAt: string | null
}> {
  const results = (payload as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  const seen = new Set<string>()
  return results
    .map((raw) => {
      const hit = raw as SearchHit
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
    .slice(0, SEARCH_LIMIT)
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

function buildSourceContent(
  query: string,
  items: Array<{ title: string; url: string; snippet: string; publishedAt: string | null }>,
): string {
  const header = `以下是围绕「${query}」自动搜索到的公开网页线索（标题+摘要+来源），只用于启发选题角度，不要当作事实依据引用：`
  const lines = items.map((item, index) => {
    const host = hostnameOf(item.url)
    const date = item.publishedAt ? `，${item.publishedAt}` : ""
    return `${index + 1}. ${item.title}：${item.snippet.slice(0, SNIPPET_MAX_CHARS)}（${host || "网页"}${date}）`
  })
  const body = lines.join("\n")
  return body.length > CONTENT_MAX_CHARS
    ? `${header}\n${body.slice(0, CONTENT_MAX_CHARS)}\n…（更多线索已截断）`
    : `${header}\n${body}`
}

/**
 * 搜索并组装成一条「全网线索」选题来源。
 * 未配置 key、非 200、超时、解析不出条目——一律返回 null，绝不抛错：
 * 联网是可选增强，不能阻塞或污染选题生成。
 */
export async function fetchTopicWebResearchSource(
  query: string | null,
): Promise<TopicSource | null> {
  const normalized = query?.trim()
  const apiKey = env.TOPIC_WEB_SEARCH_API_KEY?.trim()
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
        max_results: SEARCH_LIMIT,
        search_depth: "basic",
      }),
    })
    if (!response.ok) return null

    const items = parseTopicSearchResults(await response.json())
    if (items.length === 0) return null

    return {
      category: "web_research",
      title: `全网线索：${normalized}`,
      content: buildSourceContent(normalized, items),
    }
  } catch {
    // 联网线索是可选增强：搜索失败静默跳过，让选题照常进行
    return null
  }
}

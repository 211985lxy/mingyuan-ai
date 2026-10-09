import { isWebSearchEnabled, runWebSearch } from "@/lib/web-search"
import { HotTopicIntelligenceError, MIN_EVIDENCE_COUNT, SEARCH_LIMIT, SEARCH_RETRY_LIMIT, SEARCH_TIMEOUT_MS, type SearchEvidence } from "./types"
import { toIsoDate } from "./formatting"

/**
 * 取回一条查询的证据。配了共享搜索层（Tavily）就走可靠源，
 * 否则退回既有的 Bing RSS 实现——零回归，且配了 key 立刻变可靠。
 *
 * 为什么需要这个分支：Bing 的 `format=rss` 表面已不可用，实测「某地暴雨内涝」
 * 返回斗地主页面、「教师节送礼引发争议」返回教育考试网导航页，且**不报错**——
 * 下面的「至少 N 条」校验会把垃圾当有效证据放行，模型据此生成"事实核实过的洞察"。
 */
async function fetchEvidenceForQuery(query: string): Promise<SearchEvidence[]> {
  if (!isWebSearchEnabled()) return fetchBingRssEvidence(query)

  const hits = await runWebSearch(query, { limit: SEARCH_LIMIT })
  if (!hits) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_SEARCH_FAILED",
      "热点事实检索暂时失败，请稍后重试",
      502,
    )
  }
  return hits.map((hit) => ({
    title: hit.title,
    snippet: hit.snippet,
    url: hit.url,
    publishedAt: hit.publishedAt,
  }))
}

/**
 * @description 请求获取searchevidence
 * @param topicTitle - 主题标题
 * @returns Promise<SearchEvidence[]>
 */
export async function fetchSearchEvidence(topicTitle: string): Promise<SearchEvidence[]> {
  const queryVariants = dedupeQueries([
    topicTitle,
    `${topicTitle} 新闻`,
    `${topicTitle} 事件`,
  ])

  let combined: SearchEvidence[] = []
  let lastError: unknown = null

  for (const query of queryVariants) {
    try {
      const items = await fetchEvidenceForQuery(query)
      combined = dedupeByUrl([...combined, ...items]).slice(0, SEARCH_LIMIT)
      if (combined.length >= MIN_EVIDENCE_COUNT) {
        return combined
      }
    } catch (error) {
      lastError = error
    }
  }

  if (combined.length >= MIN_EVIDENCE_COUNT) {
    return combined
  }

  if (lastError instanceof HotTopicIntelligenceError) {
    throw lastError
  }

  throw new HotTopicIntelligenceError(
    "HOT_TOPIC_SEARCH_FAILED",
    "热点事实检索暂时失败，请稍后重试",
    502,
  )
}

async function fetchBingRssEvidence(query: string): Promise<SearchEvidence[]> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < SEARCH_RETRY_LIMIT; attempt += 1) {
    try {
      const url = new URL("https://www.bing.com/search")
      url.searchParams.set("format", "rss")
      url.searchParams.set("q", query)

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MarketingVideoPipeline/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      })

      if (!response.ok) {
        throw new HotTopicIntelligenceError(
          "HOT_TOPIC_SEARCH_FAILED",
          `热点搜索失败: ${response.status}`,
          502,
        )
      }

      const xml = await response.text()
      const items = parseBingRss(xml).slice(0, SEARCH_LIMIT)

      if (items.length < MIN_EVIDENCE_COUNT) {
        throw new HotTopicIntelligenceError(
          "HOT_TOPIC_SEARCH_INSUFFICIENT",
          "热点事实检索结果不足，暂时无法生成可靠洞察",
          503,
        )
      }

      return items
    } catch (error) {
      lastError = error
      if (attempt < SEARCH_RETRY_LIMIT - 1) {
        await sleep(300 * (attempt + 1))
      }
    }
  }

  if (lastError instanceof HotTopicIntelligenceError) {
    throw lastError
  }

  throw new HotTopicIntelligenceError(
    "HOT_TOPIC_SEARCH_FAILED",
    "热点事实检索暂时失败，请稍后重试",
    502,
  )
}

function parseBingRss(xml: string): SearchEvidence[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => match[1])
    .map((block) => ({
      title: cleanupXmlText(readXmlTag(block, "title")),
      snippet: cleanupXmlText(readXmlTag(block, "description")),
      url: cleanupXmlText(readXmlTag(block, "link")),
      publishedAt: toIsoDate(readXmlTag(block, "pubDate")),
    }))
    .filter((item) => item.title && item.snippet && item.url)

  return dedupeByUrl(items)
}

function readXmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match?.[1] || ""
}

function cleanupXmlText(value: string): string {
  return decodeXmlEntities(value)
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function dedupeByUrl(items: SearchEvidence[]): SearchEvidence[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>()
  return queries.filter((query) => {
    const normalized = query.trim()
    if (!normalized || seen.has(normalized)) {
      return false
    }

    seen.add(normalized)
    return true
  })
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

import { HotTopicIntelligenceError, MIN_EVIDENCE_COUNT, SEARCH_LIMIT, SEARCH_RETRY_LIMIT, SEARCH_TIMEOUT_MS, type SearchEvidence } from "./types"
import { toIsoDate } from "./formatting"

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
      const items = await fetchBingRssEvidence(query)
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

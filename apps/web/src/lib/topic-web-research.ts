import type { TopicSource } from "@/lib/topic-source-builders"
import { isWebSearchEnabled, runWebSearch, type WebSearchHit } from "@/lib/web-search"

/**
 * 选题联网线索：把共享搜索层的结果组装成一条选题来源。
 *
 * 范围约定（2026-09-16 与业务确认）：**只在选题生成时搜索，写文案链路不接**——
 * 写稿的知识来源是项目知识库 / IP 档案 / 爆款库，联网搜索会拖慢出稿（链路本就在
 * 115 秒预算边缘）且把不可控噪声引成稿。该约定由单测（引用面扫描）钉住。
 *
 * 搜索能力本身在 `lib/web-search`（共享层：Tavily + 配置门控，热点情报也用它）；
 * 这里只负责"用什么词搜"和"搜到的东西怎么进 prompt"。
 */

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

/** 选题是否具备联网能力（未配 key 时选题照常进行，只是不联网） */
export function isTopicWebResearchEnabled(): boolean {
  return isWebSearchEnabled()
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** 把搜索结果渲染成给模型看的线索块（标题 + 摘要 + 来源域名 + 日期） */
export function buildTopicWebResearchContent(query: string, hits: WebSearchHit[]): string {
  const header = `以下是围绕「${query}」自动搜索到的公开网页线索（标题+摘要+来源），只用于启发选题角度，不要当作事实依据引用：`
  const lines = hits.map((hit, index) => {
    const host = hostnameOf(hit.url)
    const date = hit.publishedAt ? `，${hit.publishedAt}` : ""
    return `${index + 1}. ${hit.title}：${hit.snippet.slice(0, SNIPPET_MAX_CHARS)}（${host || "网页"}${date}）`
  })
  const body = lines.join("\n")
  return body.length > CONTENT_MAX_CHARS
    ? `${header}\n${body.slice(0, CONTENT_MAX_CHARS)}\n…（更多线索已截断）`
    : `${header}\n${body}`
}

/**
 * 搜索并组装成一条「全网线索」选题来源。
 * 未配 key / 非 200 / 超时 / 解析不出条目 —— 一律返回 null：
 * 联网是可选增强，不能阻塞或污染选题生成。
 */
export async function fetchTopicWebResearchSource(
  query: string | null,
): Promise<TopicSource | null> {
  const normalized = query?.trim()
  if (!normalized) return null

  const hits = await runWebSearch(normalized, { limit: SEARCH_LIMIT })
  if (!hits) return null

  return {
    category: "web_research",
    title: `全网线索：${normalized}`,
    content: buildTopicWebResearchContent(normalized, hits),
  }
}

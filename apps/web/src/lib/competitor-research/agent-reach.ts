import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { logger } from "@/lib/logger"

const execFileAsync = promisify(execFile)

const DOCTOR_TIMEOUT_MS = 15_000
const SEARCH_TIMEOUT_MS = 10_000
const SEARCH_LIMIT = 5

export interface AgentReachResearchItem {
  title: string
  url: string
  snippet: string
  publishedAt: string | null
  source: string
}

export interface AgentReachResearchAvailability {
  web: boolean
  rss: boolean
  summary: string
}

export interface AgentReachResearchResult {
  query: string
  items: AgentReachResearchItem[]
  warnings: string[]
  availability: AgentReachResearchAvailability
}

interface AgentReachDoctorChannel {
  status?: string
  active_backend?: string | null
  message?: string
}

interface AgentReachDoctorResult {
  web?: AgentReachDoctorChannel
  rss?: AgentReachDoctorChannel
}

export async function runAgentReachCompetitorResearch(query: string): Promise<AgentReachResearchResult> {
  const normalizedQuery = query.trim().slice(0, 120)
  if (!normalizedQuery) {
    throw new Error("请输入要补证的关键词")
  }

  const warnings: string[] = []
  const doctor = await readAgentReachDoctor(warnings)
  const availability = buildAvailability(doctor)

  if (!availability.web && !availability.rss) {
    throw new Error("agent-reach 当前未启用公开 web / RSS 能力，暂时无法做全网补证")
  }

  let items: AgentReachResearchItem[] = []
  let lastError: unknown = null
  for (const variant of buildQueryVariants(normalizedQuery)) {
    try {
      const next = await fetchBingRss(variant)
      items = dedupeByUrl([...items, ...next]).slice(0, SEARCH_LIMIT)
      if (items.length >= SEARCH_LIMIT) break
    } catch (error) {
      lastError = error
      logger.warn({ err: error, query: variant }, "competitor web research search failed")
    }
  }

  if (items.length === 0) {
    if (lastError instanceof Error) {
      throw new Error(lastError.message || "暂时没有搜到可用的公开网页线索，换个更具体的关键词试试")
    }
    throw new Error("暂时没有搜到可用的公开网页线索，换个更具体的关键词试试")
  }

  return {
    query: normalizedQuery,
    items,
    warnings,
    availability,
  }
}

function buildQueryVariants(query: string): string[] {
  return Array.from(
    new Set([
      query,
      `${query} 抖音`,
      `${query} 视频`,
    ]),
  )
}

async function readAgentReachDoctor(warnings: string[]): Promise<AgentReachDoctorResult | null> {
  try {
    const { stdout } = await execFileAsync("agent-reach", ["doctor", "--json"], {
      timeout: DOCTOR_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    })
    return JSON.parse(stdout) as AgentReachDoctorResult
  } catch (error) {
    logger.warn({ err: error }, "agent-reach doctor failed, falling back to public web search")
    warnings.push("agent-reach 体检失败，本次按公开 web 路径兜底执行。")
    return null
  }
}

function buildAvailability(doctor: AgentReachDoctorResult | null): AgentReachResearchAvailability {
  const web = doctor?.web?.status === "ok"
  const rss = doctor?.rss?.status === "ok"

  if (!doctor) {
    return {
      web: true,
      rss: true,
      summary: "未读到 doctor，按公开 web/RSS 兜底",
    }
  }

  return {
    web,
    rss,
    summary: `web: ${formatChannel(doctor.web)} / rss: ${formatChannel(doctor.rss)}`,
  }
}

function formatChannel(channel: AgentReachDoctorChannel | undefined): string {
  if (!channel) return "unknown"
  return channel.active_backend || channel.status || "unknown"
}

async function fetchBingRss(query: string): Promise<AgentReachResearchItem[]> {
  const url = new URL("https://www.bing.com/search")
  url.searchParams.set("format", "rss")
  url.searchParams.set("q", query)

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MingyuanCompetitorResearch/1.0)",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  })

  if (!response.ok) {
    throw new Error(`Bing RSS search failed: ${response.status}`)
  }
  const items = parseBingRss(await response.text())
  if (items.length === 0) {
    throw new Error("公开网页搜索结果不足，请换个更具体的关键词")
  }
  return items
}

export function parseBingRss(xml: string): AgentReachResearchItem[] {
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || []
  return itemMatches
    .map((itemXml) => {
      const title = decodeXml(readTag(itemXml, "title"))
      const url = decodeXml(readTag(itemXml, "link"))
      if (!title || !url) return null

      return {
        title,
        url,
        snippet: decodeXml(readTag(itemXml, "description")),
        publishedAt: decodeXml(readTag(itemXml, "pubDate")) || null,
        source: safeHostname(url),
      }
    })
    .filter((item): item is AgentReachResearchItem => Boolean(item))
}

function readTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match?.[1]?.trim() || ""
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return "网页"
  }
}

function dedupeByUrl(items: AgentReachResearchItem[]): AgentReachResearchItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

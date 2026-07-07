import fs from "node:fs/promises"
import path from "node:path"

export type AccountIndustrySource = {
  source_name: string
  source_url: string
  source_type?: string
  status?: string
  note?: string
}

export type AccountSourceBinding = {
  email: string
  sources: AccountIndustrySource[]
}

type AccountSourceFile = {
  accounts?: AccountSourceBinding[]
}

type RadarItem = {
  id?: string
  title?: string
  source_name?: string
  source_type?: string
  evidence_level?: string
  published_at?: string
  summary?: string
  url?: string
  category?: string
  score?: number
  tier?: string
}

export type IndustryBriefingItem = {
  id: string
  title: string
  source: string
  publishedAt: string | null
  timeText: string
  summary: string
  url: string
  category: "client-industry"
  categoryLabel: string
}

export const BUILT_IN_ACCOUNT_SOURCE_BINDINGS: AccountSourceBinding[] = [
  {
    email: "957739245@qq.com",
    sources: [
      {
        source_name: "中汝达AI数字供暖情报雷达",
        source_url: "/hot-sources/zhongruda-ai-heating/items.json",
        source_type: "static",
        status: "active",
        note: "网站内置行业信源，供热点精选和选题雷达使用。",
      },
    ],
  },
]

const DEFAULT_SOURCE_FILES = [
  path.join(process.cwd(), "data/account_sources.local.json"),
  "/Users/xiangyu/Documents/Codex/2026-07-03/new-chat/ai-news-radar/data/account_sources.local.json",
]

export async function loadAccountSourceBindings(): Promise<AccountSourceBinding[]> {
  const candidates = [
    process.env.ACCOUNT_SOURCES_FILE,
    ...DEFAULT_SOURCE_FILES,
  ].filter((value): value is string => Boolean(value))

  for (const file of candidates) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8")) as AccountSourceFile
      return Array.isArray(parsed.accounts) ? parsed.accounts : []
    } catch {
      // ponytail: first existing local file wins; missing files are normal.
    }
  }
  return []
}

export function sourcesForEmail(bindings: AccountSourceBinding[], email: string) {
  const seen = new Set<string>()
  return bindings
    .filter((entry) => entry.email.toLowerCase() === email.toLowerCase())
    .flatMap((entry) => entry.sources)
    .filter((source) => source.status !== "inactive")
    .filter((source) => {
      const key = source.source_url || source.source_name
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export async function fetchIndustryBriefingItems(
  source: AccountIndustrySource,
  baseUrl?: string
): Promise<IndustryBriefingItem[]> {
  const rawUrl = source.source_url.endsWith(".json")
    ? source.source_url
    : `${source.source_url.replace(/\/$/, "")}/data/items.json`
  const payload = rawUrl.startsWith("/")
    ? await readPublicJson(rawUrl)
    : await fetchJson(rawUrl.startsWith("/") ? new URL(rawUrl, baseUrl).toString() : rawUrl)
  const rows = Array.isArray(payload.items) ? payload.items : []

  return rows
    .filter((item) => item.title && item.url)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, 15)
    .map((item, index) => ({
      id: item.id || `industry-${index}`,
      title: String(item.title),
      source: item.source_name || source.source_name,
      publishedAt: normalizeDate(item.published_at),
      timeText: item.published_at && item.published_at !== "待复核" ? item.published_at : "待复核",
      summary: item.summary || source.note || "行业信源发现，引用前建议回原文复核。",
      url: String(item.url),
      category: "client-industry",
      categoryLabel: "客户行业热点",
    }))
}

async function fetchJson(url: string): Promise<{ items?: RadarItem[] }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`行业信源读取失败：${response.status}`)
  return await response.json() as { items?: RadarItem[] }
}

async function readPublicJson(urlPath: string): Promise<{ items?: RadarItem[] }> {
  const safePath = urlPath.replace(/^\/+/, "")
  const candidates = [
    path.join(process.cwd(), "public", safePath),
    path.join(process.cwd(), "apps/web/public", safePath),
  ]

  for (const file of candidates) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as { items?: RadarItem[] }
    } catch {
      // ponytail: standalone runs from repo root, dev runs from apps/web.
    }
  }
  throw new Error(`行业信源文件不存在：${urlPath}`)
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !value || value === "待复核") return null
  return value
}

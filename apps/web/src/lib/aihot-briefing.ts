import { prisma } from "@/lib/prisma"
import { fetchAiNewsRadarCreatorItems } from "@/lib/ai-news-radar-client"
import { AIHOT_USER_AGENT } from "@/lib/aihot-constants"
import type { AiHotItem, AiHotResponse } from "@/lib/aihot-client"

export const AIHOT_BRIEFING_TITLE = "选题雷达 · 今日 9 点"

const AIHOT_ITEMS_URL = "https://aihot.virxact.com/api/public/items"
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const CATEGORY_LABELS = {
  "ai-models": "模型发布/更新",
  "ai-products": "产品发布/更新",
  industry: "行业动态",
  paper: "论文研究",
  tip: "技巧与观点",
  creator: "自媒体热榜",
} as const

const CATEGORY_ORDER: AiHotBriefingCategory[] = [
  "ai-models",
  "ai-products",
  "industry",
  "paper",
  "tip",
  "creator",
]

export type AiHotBriefingCategory = keyof typeof CATEGORY_LABELS

export interface AiHotBriefingItem {
  id: string
  title: string
  source: string
  publishedAt: string | null
  timeText: string
  summary: string
  url: string
  category: AiHotBriefingCategory
  categoryLabel: string
}

export interface AiHotBriefingPayload {
  title: string
  date: string
  generatedAt: string
  windowStart: string
  windowEnd: string
  markdown: string
  items: AiHotBriefingItem[]
}

type GenerateOptions = {
  now?: Date
  forceRefresh?: boolean
  fetchImpl?: typeof fetch
}

export function getBeijingDateKey(date: Date): string {
  return new Date(date.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10)
}

export function getBriefingWindow(now = new Date()) {
  return {
    windowStart: new Date(now.getTime() - DAY_MS),
    windowEnd: now,
  }
}

export async function getTodayAiHotBriefing(options: GenerateOptions = {}) {
  const now = options.now ?? new Date()
  const date = getBeijingDateKey(now)

  if (!options.forceRefresh) {
    const existing = await prisma.aiHotBriefing.findUnique({ where: { date } })
    if (existing) return serializeBriefing(existing)
  }

  return generateAndStoreAiHotBriefing(options)
}

export async function generateAndStoreAiHotBriefing(options: GenerateOptions = {}) {
  const now = options.now ?? new Date()
  const date = getBeijingDateKey(now)
  const { windowStart, windowEnd } = getBriefingWindow(now)
  const items = await fetchSelectedItems(windowStart, options.fetchImpl ?? fetch)
  const selectedItems = selectBriefingItems(items, now)
  const markdown = buildAiHotBriefingMarkdown(selectedItems)

  const record = await prisma.aiHotBriefing.upsert({
    where: { date },
    update: {
      title: AIHOT_BRIEFING_TITLE,
      generatedAt: now,
      windowStart,
      windowEnd,
      markdown,
      items: selectedItems as any,
    },
    create: {
      date,
      title: AIHOT_BRIEFING_TITLE,
      generatedAt: now,
      windowStart,
      windowEnd,
      markdown,
      items: selectedItems as any,
    },
  })

  return serializeBriefing(record)
}

export async function fetchSelectedItems(windowStart: Date, fetchImpl: typeof fetch = fetch) {
  const params = new URLSearchParams({
    mode: "selected",
    since: windowStart.toISOString(),
    take: "100",
  })
  const res = await fetchImpl(`${AIHOT_ITEMS_URL}?${params.toString()}`, {
    headers: { "User-Agent": AIHOT_USER_AGENT },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    throw new Error("AI HOT 精选内容暂时不可用")
  }

  const data = (await res.json()) as AiHotResponse
  const aiHotItems = Array.isArray(data.items) ? data.items : []

  try {
    const creatorItems = await fetchAiNewsRadarCreatorItems(fetchImpl)
    return [...creatorItems, ...aiHotItems]
  } catch (error) {
    console.warn("[aihot-briefing] AI News Radar creator source unavailable:", (error as Error).message)
    return aiHotItems
  }
}

export function selectBriefingItems(items: AiHotItem[], now = new Date()) {
  const validItems = items.filter((item) => isKnownCategory(item.category))
  const selected: AiHotItem[] = []
  const usedIds = new Set<string>()

  for (const category of CATEGORY_ORDER) {
    const item = validItems.find((candidate) => candidate.category === category)
    if (item) {
      selected.push(item)
      usedIds.add(item.id)
    }
  }

  for (const item of validItems) {
    if (selected.length >= 15) break
    if (usedIds.has(item.id)) continue
    selected.push(item)
    usedIds.add(item.id)
  }

  return selected.map((item) => toBriefingItem(item, now))
}

export function buildAiHotBriefingMarkdown(items: AiHotBriefingItem[]) {
  const lines = [
    `# ${AIHOT_BRIEFING_TITLE}`,
    "",
    "推荐优先级：当前账号资料/资料库 > 对标账号/对标文案 > 行业热点/AI HOT。下面内容只是今日选题线索，不是最终推荐选题；进入选题工作台后会结合账号资料、对标素材和行业热点生成可拍选题。",
  ]
  let index = 1

  if (items.length === 0) {
    lines.push("", "今天最近 24 小时内暂时没有可用的 AI HOT 线索。")
    return lines.join("\n")
  }

  for (const category of CATEGORY_ORDER) {
    const sectionItems = items.filter((item) => item.category === category)
    if (sectionItems.length === 0) continue

    lines.push("", `## ${CATEGORY_LABELS[category]}`)
    for (const item of sectionItems) {
      lines.push(
        `${index}. **${item.title}** — ${item.source}`,
        `   ${item.timeText}`,
        `   ${item.summary}`,
        `   ${item.url}`
      )
      index += 1
    }
  }

  return lines.join("\n")
}

export function getCategoryLabel(category: AiHotBriefingCategory) {
  return CATEGORY_LABELS[category]
}

function toBriefingItem(item: AiHotItem, now: Date): AiHotBriefingItem {
  const category = item.category as AiHotBriefingCategory

  return {
    id: item.id,
    title: item.title,
    source: item.source,
    publishedAt: item.publishedAt ?? null,
    timeText: formatBeijingTime(item.publishedAt ?? null, now),
    summary: truncateSummary(item.summary || item.title),
    url: item.url,
    category,
    categoryLabel: CATEGORY_LABELS[category],
  }
}

function isKnownCategory(category: AiHotItem["category"]): category is AiHotBriefingCategory {
  return typeof category === "string" && category in CATEGORY_LABELS
}

function truncateSummary(summary: string) {
  const normalized = summary.replace(/\s+/g, " ").trim()
  if (normalized.length <= 50) return normalized
  return `${normalized.slice(0, 49)}…`
}

function formatBeijingTime(value: string | null, now: Date) {
  if (!value) return "发布时间未知"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "发布时间未知"

  const diffMs = now.getTime() - date.getTime()
  if (diffMs >= 0 && diffMs < 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)))
    return `${minutes} 分钟前`
  }
  if (diffMs >= 0 && diffMs < DAY_MS) {
    const hours = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)))
    return `${hours} 小时前`
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function serializeBriefing(record: {
  title: string
  date: string
  generatedAt: Date
  windowStart: Date
  windowEnd: Date
  markdown: string
  items: unknown
}): AiHotBriefingPayload {
  return {
    title: record.title,
    date: record.date,
    generatedAt: record.generatedAt.toISOString(),
    windowStart: record.windowStart.toISOString(),
    windowEnd: record.windowEnd.toISOString(),
    markdown: record.markdown,
    items: Array.isArray(record.items) ? (record.items as AiHotBriefingItem[]) : [],
  }
}

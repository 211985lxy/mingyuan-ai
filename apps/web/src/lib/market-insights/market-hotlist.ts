import { prisma } from "@/lib/prisma"
import { runLast30DaysResearch, type Last30DaysItem } from "@/lib/market-insights/last30days"
import type { Prisma } from "@/generated/prisma/client"

export interface MarketHotSnapshotPayload {
  date: string
  generatedAt: string | null
  items: Last30DaysItem[]
  warnings: string[]
  summary: string
  status: "success" | "partial" | "failed" | "empty"
}

const MARKET_HOT_TOPIC = "热点"
const MARKET_HOT_SOURCES = ["weibo", "xiaohongshu", "bilibili", "zhihu", "douyin", "wechat", "baidu", "toutiao"]

/**
 * @description 获取最新的markethotsnapshot
 * @returns Promise<MarketHotSnapshotPayload>
 */
export async function getLatestMarketHotSnapshot(): Promise<MarketHotSnapshotPayload> {
  const today = getBeijingDateKey()
  const record = await prisma.marketHotSnapshot.findFirst({
    where: { OR: [{ date: today }, { date: { not: today } }] },
    orderBy: [{ date: "desc" }, { generatedAt: "desc" }],
  })

  if (!record) {
    return {
      date: today,
      generatedAt: null,
      items: [],
      warnings: [],
      summary: "",
      status: "empty",
    }
  }

  return {
    date: record.date,
    generatedAt: record.generatedAt.toISOString(),
    items: Array.isArray(record.items) ? record.items as unknown as Last30DaysItem[] : [],
    warnings: Array.isArray(record.warnings) ? record.warnings as unknown as string[] : [],
    summary: record.summary,
    status: normalizeStatus(record.status),
  }
}

/**
 * @description 刷新markethotsnapshot
 * @returns Promise<MarketHotSnapshotPayload>
 */
export async function refreshMarketHotSnapshot(): Promise<MarketHotSnapshotPayload> {
  const date = getBeijingDateKey()
  const generatedAt = new Date()

  try {
    const result = await runLast30DaysResearch(MARKET_HOT_TOPIC, MARKET_HOT_SOURCES)
    const items = dedupeItems(result.items).slice(0, 80)
    const status = result.warnings.length > 0 ? "partial" : "success"
    const record = await prisma.marketHotSnapshot.upsert({
      where: { date },
      update: {
        generatedAt,
        items: items as unknown as Prisma.InputJsonValue,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
        summary: result.summary,
        status,
      },
      create: {
        date,
        generatedAt,
        items: items as unknown as Prisma.InputJsonValue,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
        summary: result.summary,
        status,
      },
    })

    return toPayload(record)
  } catch (error) {
    const message = error instanceof Error ? error.message : "近30天热榜刷新失败"
    const record = await prisma.marketHotSnapshot.upsert({
      where: { date },
      update: {
        generatedAt,
        items: [],
        warnings: [message],
        summary: "",
        status: "failed",
      },
      create: {
        date,
        generatedAt,
        items: [],
        warnings: [message],
        summary: "",
        status: "failed",
      },
    })
    return toPayload(record)
  }
}

function toPayload(record: {
  date: string
  generatedAt: Date
  items: unknown
  warnings: unknown
  summary: string
  status: string
}): MarketHotSnapshotPayload {
  return {
    date: record.date,
    generatedAt: record.generatedAt.toISOString(),
    items: Array.isArray(record.items) ? record.items as Last30DaysItem[] : [],
    warnings: Array.isArray(record.warnings) ? record.warnings as string[] : [],
    summary: record.summary,
    status: normalizeStatus(record.status),
  }
}

function dedupeItems(items: Last30DaysItem[]): Last30DaysItem[] {
  const seen = new Set<string>()
  return [...items]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    })
    .filter((item) => {
      const key = item.url || `${item.platform}:${item.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function getBeijingDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

function normalizeStatus(status: string): MarketHotSnapshotPayload["status"] {
  if (status === "success" || status === "partial" || status === "failed") return status
  return "empty"
}

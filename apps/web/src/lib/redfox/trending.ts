/**
 * 全网热榜 TOP10 模块。
 *
 * 基于 RedFox API `/story/api/hotKeyword/list` 获取 24h 全网热榜，
 * 覆盖抖音、微博、B站、快手、知乎、头条、百度 7 大平台。
 * 归一化为现有热点/选题信号格式。
 */

import { redfoxPost, hasRedFoxApiKey } from './client'

// ── 类型 ──

export interface TrendingItem {
  /** 热搜关键词 */
  keyword: string
  /** 热度分 */
  heatScore: number
  /** 所属平台 */
  platform: string
  /** 热搜摘要/描述（部分词条提供） */
  summary?: string
  /** 热搜链接（部分词条提供） */
  url?: string
  /** 在榜单中的排名 */
  rank: number
}

export interface TrendingResult {
  items: TrendingItem[]
  fetchedAt: string
  source: 'redfox'
}

// ── RedFox 响应类型 ──

interface RedFoxTrendingResponse {
  list?: RedFoxTrendingItem[]
}

interface RedFoxTrendingItem {
  /** 热搜关键词 */
  keyword?: string
  /** 热搜标题（部分接口用 title 代替 keyword） */
  title?: string
  /** 热度分 */
  hotValue?: number
  /** 热度指数（备选字段） */
  hotIndex?: number
  /** 所属平台 */
  platform?: string
  /** 摘要 */
  summary?: string
  /** 链接 */
  url?: string
}

// ── 核心方法 ──

/**
 * 获取全网热榜 TOP10。
 *
 * @param options.dateRange 日期范围（默认今日）
 */
export async function fetchRedFoxTrendingTop10(options?: {
  startDate?: string
  endDate?: string
}): Promise<TrendingResult> {
  if (!hasRedFoxApiKey()) {
    throw new Error('未配置 REDFOX_API_KEY，无法获取全网热榜')
  }

  const body: Record<string, unknown> = { source: 'aim' }
  if (options?.startDate) body.startDate = options.startDate
  if (options?.endDate) body.endDate = options.endDate

  const data = await redfoxPost<RedFoxTrendingResponse>(
    '/story/api/hotKeyword/list',
    body,
  )

  const rawItems = Array.isArray(data.list) ? data.list : []
  const items: TrendingItem[] = rawItems
    .map(normalizeTrendingItem)
    .filter((item): item is TrendingItem => Boolean(item))
    .slice(0, 50) // 最多取 50 条，后续由前端分页

  return {
    items,
    fetchedAt: new Date().toISOString(),
    source: 'redfox',
  }
}

/**
 * 检查热榜 API 是否可用。
 */
export function hasTrendingApi(): boolean {
  return hasRedFoxApiKey()
}

// ── 归一化 ──

function normalizeTrendingItem(item: RedFoxTrendingItem): TrendingItem | null {
  const keyword = item.keyword || item.title || ''
  if (!keyword) return null

  return {
    keyword,
    heatScore: numberValue(item.hotValue ?? item.hotIndex),
    platform: item.platform || 'all',
    summary: item.summary || '',
    url: item.url || '',
    rank: 0, // 由调用方在排序后赋值
  }
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

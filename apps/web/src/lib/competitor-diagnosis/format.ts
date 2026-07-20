import type { ConfidenceLevel } from "./types"

// ─── Platform / Dimensions ──────────────────────────────

export const PLATFORM_LABELS: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  bilibili: "哔哩哔哩",
  kuaishou: "快手",
}

/**
 * @description platformlabel
 * @param platform - 平台
 * @returns string
 */
export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

export const SCORE_DIMENSIONS = [
  { key: "content_power", label: "内容力", description: "内容质量与爆款率" },
  { key: "growth_power", label: "涨粉力", description: "粉丝增长能力" },
  { key: "engagement_power", label: "互动力", description: "互动率与粉丝活跃" },
  { key: "monetization_power", label: "变现力", description: "商业价值与带货" },
  { key: "persona_power", label: "人设力", description: "IP辨识度与信任感" },
  { key: "operation_power", label: "运营力", description: "发布稳定性与数据" },
] as const

// ─── Posting Heatmap ────────────────────────────────────

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
export const DAY_LABELS: Record<string, string> = {
  Sun: "日", Mon: "一", Tue: "二", Wed: "三", Thu: "四", Fri: "五", Sat: "六",
}
export const HOURS = Array.from({ length: 24 }, (_, i) => i)

/**
 * @description cellintensity
 * @param day - day
 * @param hour - hour
 * @param heatmap - heatmap
 * @param max - 最大值
 * @returns string
 */
export function cellIntensity(
  day: string,
  hour: number,
  heatmap: Record<string, number>,
  max: number,
): string {
  const key = `${day}-${String(hour).padStart(2, "0")}`
  const v = heatmap[key] ?? 0
  if (max === 0 || v === 0) return "bg-muted/30"
  const ratio = v / max
  if (ratio <= 0.25) return "bg-primary/20"
  if (ratio <= 0.5) return "bg-primary/40"
  if (ratio <= 0.75) return "bg-primary/60"
  return "bg-primary/80"
}

// ─── Formatters ─────────────────────────────────────────

/**
 * @description proxyavatarurl
 * @param url - URL 地址
 * @returns string
 */
export function proxyAvatarUrl(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
}

/**
 * @description 格式化date
 * @param dateStr - 日期Str
 * @returns string
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

/**
 * @description 格式化count
 * @param n - n
 * @returns string
 */
export function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}千`
  return String(n)
}

/**
 * @description 评分color
 * @param score - 分数
 * @returns string
 */
export function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600"
  if (score >= 60) return "text-amber-500"
  return "text-orange-500"
}

// ─── Confidence ─────────────────────────────────────────

export const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  "高": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "中高": "bg-sky-100 text-sky-700 border-sky-200",
  "中": "bg-amber-100 text-amber-700 border-amber-200",
  "低": "bg-zinc-100 text-zinc-500 border-zinc-200",
}

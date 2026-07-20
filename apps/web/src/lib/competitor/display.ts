import type { ApiCompetitorReport } from "@/types/api"

/**
 * @description 格式化competitorcount
 * @param value - 值
 * @returns string
 */
export function formatCompetitorCount(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`
  return value.toLocaleString("zh-CN")
}

/**
 * @description 格式化competitorrelativetime
 * @param iso - iso
 * @returns string
 */
export function formatCompetitorRelativeTime(iso: string | null): string {
  if (!iso) return "尚未刷新"
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return new Date(iso).toLocaleDateString("zh-CN")
}

/**
 * @description 格式化competitordate
 * @param iso - iso
 * @returns string
 */
export function formatCompetitorDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("zh-CN") : "未完成"
}

/**
 * @description competitorreporttitle
 * @param report - 报告
 * @returns string
 */
export function competitorReportTitle(report: ApiCompetitorReport): string {
  return `${report.accountName || "优质账号"} · 分析报告`
}

/**
 * @description competitorreportstatuslabel
 * @param status - 状态
 * @returns string
 */
export function competitorReportStatusLabel(status: ApiCompetitorReport["status"]): string {
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  return "分析中"
}

/**
 * @description 格式化competitoraccountname
 * @param account - 账户
 * @returns string
 */
export function formatCompetitorAccountName(account: { nickname?: string | null; targetUrl: string }): string {
  if (account.nickname) return account.nickname
  try {
    const url = new URL(account.targetUrl)
    const tail = url.pathname.split("/").filter(Boolean).at(-1)
    if (tail) return `抖音账号 · ${tail.slice(0, 12)}`
  } catch {
    // Invalid pasted URLs still receive a readable fallback.
  }
  return "抖音账号（待刷新）"
}

/**
 * @description compactcompetitoraccounturl
 * @param url - URL 地址
 * @returns string
 */
export function compactCompetitorAccountUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const text = `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "")
    return text.length > 46 ? `${text.slice(0, 43)}...` : text
  } catch {
    return url.length > 46 ? `${url.slice(0, 43)}...` : url
  }
}

/**
 * @description 格式化competitorrefresherror
 * @param error - 错误对象
 * @returns string
 */
export function formatCompetitorRefreshError(error: string): string {
  if (error.includes("Timeout") || error.includes("超时")) {
    return "本地浏览器访问抖音超时，账号链接已保存，可以稍后再刷新。"
  }
  if (error.includes("BrowserType.launch") || error.includes("browser")) {
    return "本地浏览器启动失败，账号链接已保存，可以稍后再试。"
  }
  return error.split("\n")[0] || "刷新失败，账号链接已保存。"
}

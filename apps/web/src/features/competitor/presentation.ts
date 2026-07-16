import type { WatchAccount } from "@/lib/api/client"
import { getWatchVideoPageUrl } from "@/lib/watch-video-url"
import type { ApiCompetitorReport, ApiVideoCopyExtraction } from "@/types/api"

const SUPPORTED_DOMAINS = ["douyin.com", "iesdouyin.com", "v.douyin.com"]

export type WatchVideo = NonNullable<WatchAccount["latestVideos"]>[number] & {
  account: WatchAccount
  engagementScore?: number
}

export function isSupportedCompetitorUrl(url: string): boolean {
  return SUPPORTED_DOMAINS.some((domain) => url.includes(domain))
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "尚未刷新"
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return new Date(iso).toLocaleDateString("zh-CN")
}

export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("zh-CN") : "未完成"
}

export function formatCount(count: number): string {
  return count >= 10000 ? `${(count / 10000).toFixed(1)}w` : count.toLocaleString("zh-CN")
}

export function reportTitle(report: ApiCompetitorReport): string {
  return `${report.accountName || "优质账号"} · 分析报告`
}

export function reportStatusLabel(status: ApiCompetitorReport["status"]): string {
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  return "分析中"
}

export function formatAccountName(account: WatchAccount): string {
  if (account.nickname) return account.nickname
  try {
    const tail = new URL(account.targetUrl).pathname.split("/").filter(Boolean).at(-1)
    if (tail) return `抖音账号 · ${tail.slice(0, 12)}`
  } catch {
    // Keep the fallback readable even when a pasted URL is not normalized.
  }
  return "抖音账号（待刷新）"
}

export function compactAccountUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const text = `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "")
    return text.length > 46 ? `${text.slice(0, 43)}...` : text
  } catch {
    return url.length > 46 ? `${url.slice(0, 43)}...` : url
  }
}

export function formatRefreshError(error: string): string {
  if (error.includes("Timeout") || error.includes("超时")) return "本地浏览器访问抖音超时，账号链接已保存，可以稍后再刷新。"
  if (error.includes("BrowserType.launch") || error.includes("browser")) return "本地浏览器启动失败，账号链接已保存，可以稍后再试。"
  return error.split("\n")[0] || "刷新失败，账号链接已保存。"
}

export function videoPageUrl(video: WatchVideo): string {
  return getWatchVideoPageUrl({
    platform: video.account.platform || null,
    videoId: video.videoId || null,
    videoUrl: video.videoUrl || null,
    fallbackUrl: video.account.targetUrl || null,
  })
}

export function accountPageUrl(video: WatchVideo): string {
  return video.account.targetUrl || videoPageUrl(video)
}

export function extractionStatusText(record: ApiVideoCopyExtraction | undefined): string {
  if (!record) return "爆款文案拆解"
  if (record.status === "completed" && record.analysisResult) return "查看拆解"
  if (record.status === "completed") return "文案已提取"
  if (record.status === "failed") return "提取失败"
  if (record.status === "analyzing") return "分析中"
  return "提取中"
}

export function refreshStatusText(account: WatchAccount): string {
  if (account.refreshStatus === "refreshing") return "刷新中"
  if (account.refreshStatus === "failed") return "刷新失败"
  if (account.refreshStatus === "success") return "已刷新"
  return "待刷新"
}

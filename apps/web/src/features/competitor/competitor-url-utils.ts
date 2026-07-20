import { extractPureUrl, checkUrlType } from "@/lib/tikhub/url-parser"

const SUPPORTED_DOMAINS = [
  "douyin.com", "iesdouyin.com", "v.douyin.com",
  "channels.weixin.qq.com", "finder.video.qq.com",
]

/** Check whether a URL targets a supported short-video platform. */
/**
 * @description 判断是否supportedcompetitorurl
 * @param url - URL 地址
 * @returns boolean
 */
export function isSupportedCompetitorUrl(url: string): boolean {
  return SUPPORTED_DOMAINS.some((domain) => url.includes(domain))
}

export type UrlValidationError = string

/** Validate a competitor URL and return the pure URL or an error message. */
/**
 * @description 验证competitorurl
 * @param raw - 原始数据
 * @returns 无返回值
 */
export function validateCompetitorUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!isSupportedCompetitorUrl(trimmed)) {
    return { ok: false, error: "暂不支持该平台，目前支持抖音和视频号主页链接" }
  }
  const typeError = checkUrlType(trimmed)
  if (typeError) {
    return { ok: false, error: typeError }
  }
  const pureUrl = extractPureUrl(trimmed)
  if (!pureUrl) {
    return { ok: false, error: "链接格式不正确" }
  }
  return { ok: true, url: pureUrl }
}

/** Sort accounts by refresh priority: refreshing > idle > failed > success. */
/**
 * @description 排序accountsbyrefreshstatus
 * @param accounts - accounts
 * @returns T[]
 */
export function sortAccountsByRefreshStatus<T extends { refreshStatus: string }>(
  accounts: T[],
): T[] {
  const order: Record<string, number> = { refreshing: 0, idle: 1, failed: 2, success: 3 }
  return [...accounts].sort((a, b) => (order[a.refreshStatus] ?? 9) - (order[b.refreshStatus] ?? 9))
}

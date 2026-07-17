import { extractPureUrl, checkUrlType } from "@/lib/tikhub/url-parser"

const SUPPORTED_DOMAINS = ["douyin.com", "iesdouyin.com", "v.douyin.com"]

/** Check whether a URL targets a supported short-video platform. */
export function isSupportedCompetitorUrl(url: string): boolean {
  return SUPPORTED_DOMAINS.some((domain) => url.includes(domain))
}

export type UrlValidationError = string

/** Validate a competitor URL and return the pure URL or an error message. */
export function validateCompetitorUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!isSupportedCompetitorUrl(trimmed)) {
    return { ok: false, error: "第一版暂时只支持抖音主页链接" }
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
export function sortAccountsByRefreshStatus<T extends { refreshStatus: string }>(
  accounts: T[],
): T[] {
  const order: Record<string, number> = { refreshing: 0, idle: 1, failed: 2, success: 3 }
  return [...accounts].sort((a, b) => (order[a.refreshStatus] ?? 9) - (order[b.refreshStatus] ?? 9))
}

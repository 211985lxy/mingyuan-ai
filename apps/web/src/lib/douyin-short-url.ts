/**
 * 抖音链接纯函数工具（客户端安全，无 node:* 依赖）。
 *
 * 网络动作（探测短链 302）在 `@/lib/douyin-short-url-resolver`：那是服务端模块，
 * 因为本文件会被客户端图静态引用（platform-post-id → hooks），不能引入 node:dns。
 */

export function extractDouyinAwemeId(url: string): string | null {
  const match = url.match(/\/(?:share\/)?video\/(\d+)/i)
  return match?.[1] ?? null
}

/** 作品链接、modal_id 或纯数字作品 ID → aweme_id；解析不了就返回 null，不猜测。 */
export function normalizeDouyinAwemeId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim()
  if (!trimmed) return null
  if (/^\d{5,}$/.test(trimmed)) return trimmed
  const fromPath = extractDouyinAwemeId(trimmed)
  if (fromPath) return fromPath
  try {
    const parsed = new URL(trimmed)
    const fromQuery = parsed.searchParams.get("modal_id") || parsed.searchParams.get("aweme_id")
    if (fromQuery && /^\d{5,}$/.test(fromQuery)) return fromQuery
  } catch {
    // 不是 URL
  }
  return null
}

/**
 * 抖音短链主机白名单（严格相等）。
 *
 * 历史实现用 `/v\.douyin\.com/i` 子串匹配整个 URL，导致
 * `https://v.douyin.com.evil.com/`、`https://evil.com/?x=v.douyin.com` 一类
 * 攻击者可控主机被判定为「抖音短链」并送进服务端 fetch（F18 根因）。
 * 改为解析 URL 后对 hostname 做精确匹配，攻击者无法持有 v.douyin.com 该主机。
 */
const DOUYIN_SHORT_LINK_HOSTS = new Set(["v.douyin.com"])

export function isDouyinShortUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false
  return DOUYIN_SHORT_LINK_HOSTS.has(parsed.hostname.toLowerCase())
}

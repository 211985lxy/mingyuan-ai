/**
 * 抖音等 CDN 签名图常带 x-expires（unix 秒）。
 * 过期后上游会 403，图片代理也无法挽救，只能重新采集封面。
 * 本文件保持无 Node 内置依赖，供 client / server 共用。
 */
export function isSignedImageUrlExpired(
  url: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  try {
    const expires = new URL(url).searchParams.get("x-expires")
    if (!expires) return false
    const ts = Number(expires)
    return Number.isFinite(ts) && ts > 0 && ts < nowSec
  } catch {
    return false
  }
}

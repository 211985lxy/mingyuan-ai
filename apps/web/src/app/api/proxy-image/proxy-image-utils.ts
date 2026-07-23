/**
 * proxy-image route 的工具函数。
 * 独立于 route.ts，避免 Next.js App Router 对 route 模块非 handler 导出的类型推断干扰。
 */

const ALLOWED_DOMAINS = [
  "douyinpic.com",
  "douyinpics.com",
  "douyincdn.com",
  "douyinstatic.com",
  "byteimg.com",
  "pstatp.com",
  "snssdk.com",
  "xiaohongshu.com",
  "xhscdn.com",
  "xhslink.com",
]

/**
 * @description 判断是否domainallowed
 * @param hostname - hostname
 * @returns boolean
 */
export function isDomainAllowed(hostname: string): boolean {
  return ALLOWED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  )
}

/**
 * @description 获取imagecandidateurls
 * @param url - URL 地址
 * @returns string[]
 */
export function getImageCandidateUrls(url: string): string[] {
  if (!url.includes(".heic")) return [url]

  const candidates = [
    url.replace(/\.heic/g, ".webp"),
    url.replace(/\.heic/g, ".jpeg"),
    url.replace(/\.heic/g, ".jpg"),
    url,
  ]
  return [...new Set(candidates.filter(Boolean))]
}

/**
 * 抖音等 CDN 签名图常带 x-expires（unix 秒）。过期后上游会 403，代理也无法挽救，只能重新采集封面。
 */
export function isSignedImageUrlExpired(url: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  try {
    const expires = new URL(url).searchParams.get("x-expires")
    if (!expires) return false
    const ts = Number(expires)
    return Number.isFinite(ts) && ts > 0 && ts < nowSec
  } catch {
    return false
  }
}

/**
 * @description 判断是否privateipaddress
 * @param address - address
 * @returns boolean
 */
export function isPrivateIpAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number)
    return a === 10
      || a === 127
      || a === 0
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    return normalized === "::1"
      || normalized === "::"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb")
      || normalized.startsWith("::ffff:127.")
      || normalized.startsWith("::ffff:10.")
      || normalized.startsWith("::ffff:192.168.")
  }
  return false
}
import { isIP } from "node:net"

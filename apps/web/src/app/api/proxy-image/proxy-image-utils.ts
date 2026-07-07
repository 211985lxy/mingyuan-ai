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

export function isDomainAllowed(hostname: string): boolean {
  return ALLOWED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  )
}

export function getImageCandidateUrls(url: string): string[] {
  if (!url.includes(".heic")) return [url]

  const webpUrl = url.replace(/\.heic/g, ".webp")
  return webpUrl === url ? [url] : [webpUrl, url]
}

const SHORT_LINK_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"

export function extractDouyinAwemeId(url: string): string | null {
  const match = url.match(/\/(?:share\/)?video\/(\d+)/i)
  return match?.[1] ?? null
}

export function isDouyinShortUrl(url: string): boolean {
  return /v\.douyin\.com/i.test(url)
}

/** 探测 v.douyin.com 分享短链的 302 长链；失败时退回原 URL，由调用方按无统计处理。 */
export async function resolveDouyinShortUrl(url: string): Promise<string> {
  if (!isDouyinShortUrl(url)) return url
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": SHORT_LINK_UA },
    })
    const location = res.headers.get("location")
    if (location) return location
  } catch {
    // 短链探测失败时不抛错，调用方降级为「无统计」
  }
  return url
}

export async function resolveDouyinAwemeId(url: string): Promise<string | null> {
  const direct = extractDouyinAwemeId(url)
  if (direct) return direct
  if (!isDouyinShortUrl(url)) return null
  return extractDouyinAwemeId(await resolveDouyinShortUrl(url))
}

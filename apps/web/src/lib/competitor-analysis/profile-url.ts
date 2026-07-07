import type { ParsedUrl } from "@/lib/tikhub/url-parser"
import { DouyinAdapter, XiaohongshuAdapter } from "@/lib/tikhub/adapters"

interface UrlResolver {
  resolveUrl(url: string): Promise<string>
}

export interface ResolvedCompetitorProfileInput {
  targetUrl: string
  platformUserId: string | null
}

export async function resolveCompetitorProfileInput(
  parsed: ParsedUrl,
  deps: {
    douyinResolver?: UrlResolver
    xiaohongshuResolver?: UrlResolver
  } = {},
): Promise<ResolvedCompetitorProfileInput> {
  if (parsed.platform === "douyin") {
    const resolver = deps.douyinResolver ?? new DouyinAdapter()
    const platformUserId = parsed.rawUserId ?? await resolver.resolveUrl(parsed.pureUrl)
    return {
      targetUrl: `https://www.douyin.com/user/${platformUserId}`,
      platformUserId,
    }
  }

  if (parsed.platform === "xiaohongshu") {
    const resolver = deps.xiaohongshuResolver ?? new XiaohongshuAdapter()
    const platformUserId = parsed.rawUserId ?? await resolver.resolveUrl(parsed.pureUrl)
    return {
      targetUrl: `https://www.xiaohongshu.com/user/profile/${platformUserId}`,
      platformUserId,
    }
  }

  return {
    targetUrl: parsed.pureUrl,
    platformUserId: parsed.rawUserId,
  }
}

import type { ParsedUrl } from "@/lib/tikhub/url-parser"
import { DouyinAdapter, XiaohongshuAdapter, WechatChannelsAdapter } from "@/lib/tikhub/adapters"

interface UrlResolver {
  resolveUrl(url: string): Promise<string>
}

export interface ResolvedCompetitorProfileInput {
  targetUrl: string
  platformUserId: string | null
}

/**
 * @description 解析competitorprofileinput
 * @param parsed - 解析后的数据
 * @param deps - deps
 * @returns Promise<ResolvedCompetitorProfileInput>
 */
export async function resolveCompetitorProfileInput(
  parsed: ParsedUrl,
  deps: {
    douyinResolver?: UrlResolver
    xiaohongshuResolver?: UrlResolver
    wechatChannelsResolver?: UrlResolver
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

  if (parsed.platform === "wechat_channels") {
    const resolver = deps.wechatChannelsResolver ?? new WechatChannelsAdapter()
    const platformUserId = parsed.rawUserId ?? await resolver.resolveUrl(parsed.pureUrl)
    return {
      targetUrl: parsed.pureUrl,
      platformUserId,
    }
  }

  return {
    targetUrl: parsed.pureUrl,
    platformUserId: parsed.rawUserId,
  }
}

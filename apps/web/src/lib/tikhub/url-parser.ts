import type { Platform } from './types'

export interface ParsedUrl {
  platform: Platform
  rawUserId: string | null // extracted from URL path; may need resolveUrl() for final platformUserId
  pureUrl: string // clean URL for DB insertion and TikHub client request
}

/**
 * Extracts a clean, valid URL from a dirty text string containing Chinese characters,
 * spaces, emojis, or punctuation.
 *
 * Examples:
 *   - "我在小红书发现了一个超赞的博主！点击链接看看吧：https://xhslink.com/aBcDe" -> "https://xhslink.com/aBcDe"
 *   - "复制打开抖音，看看【小明】的视频吧！https://v.douyin.com/aBcDe/ 复制整个段落" -> "https://v.douyin.com/aBcDe/"
 *   - "www.douyin.com/user/MS4wLjABAAAA" -> "https://www.douyin.com/user/MS4wLjABAAAA"
 */
/**
 * @description 提取pureurl
 * @param text - 文本
 * @returns string | null
 */
export function extractPureUrl(text: string): string | null {
  if (!text) return null
  const trimmed = text.trim()

  // 1. Try to extract the first http/https URL that does NOT contain spaces or Chinese characters
  const httpMatch = trimmed.match(/(https?:\/\/[^\s\u4e00-\u9fa5]+)/i)
  if (httpMatch) {
    let url = httpMatch[1]
    // Clean up trailing common Chinese punctuation or bracket matching artifacts
    url = url.replace(/[，。；！、“”‘’'\"\]\}\)]+$/, '')
    return url
  }

  // 2. Fallback: if no http/https schema is found, see if we have one of our supported domains
  const lower = trimmed.toLowerCase()
  const domains = [
    'www.xiaohongshu.com',
    'xiaohongshu.com',
    'www.douyin.com',
    'iesdouyin.com',
    'v.douyin.com',
    'douyin.com',
    'xhslink.com',
    'xhs.cn'
  ]
  for (const domain of domains) {
    const idx = lower.indexOf(domain)
    if (idx !== -1) {
      // Extract from the start of the domain onwards, stopping at whitespace or Chinese
      const slice = trimmed.slice(idx)
      const domainMatch = slice.match(/^([^\s\u4e00-\u9fa5]+)/)
      if (domainMatch) {
        let url = domainMatch[1]
        url = url.replace(/[，。；！、“”‘’'\"\]\}\)]+$/, '')
        return `https://${url}`
      }
    }
  }

  return null
}

/**
 * Detects which social platform a URL belongs to.
 *
 * Supported platforms (MVP):
 *   - douyin:      douyin.com, iesdouyin.com, v.douyin.com
 *   - xiaohongshu: xiaohongshu.com, xhslink.com, xhs.cn
 *
 * Deferred (Phase 2):
 *   - bilibili, kuaishou
 *
 * Never throws — returns null for any unrecognised or unparseable input.
 */
/**
 * @description 检测platform
 * @param url - URL 地址
 * @returns Platform | null
 */
export function detectPlatform(url: string): Platform | null {
  try {
    const pureUrl = extractPureUrl(url)
    if (!pureUrl) return null
    const lower = pureUrl.toLowerCase()

    if (lower.includes('douyin.com') || lower.includes('iesdouyin.com')) {
      return 'douyin'
    }

    if (
      lower.includes('xiaohongshu.com') ||
      lower.includes('xhslink.com') ||
      lower.includes('xhs.cn')
    ) {
      return 'xiaohongshu'
    }

    return null
  } catch {
    return null
  }
}

/**
 * Extracts the raw user identifier from the URL path segment.
 *
 * - Douyin:      /user/<userId>
 * - Xiaohongshu: /user/profile/<userId>
 *
 * Returns null if the expected path structure is absent or the URL is
 * unparseable. Never throws.
 */
/**
 * @description 提取userid
 * @param url - URL 地址
 * @returns string | null
 */
export function extractUserId(url: string): string | null {
  try {
    const pureUrl = extractPureUrl(url)
    if (!pureUrl) return null

    const parsed = new URL(pureUrl)
    const segments = parsed.pathname.split('/').filter(Boolean)

    // Douyin: /user/<userId>
    const userIdx = segments.indexOf('user')
    if (userIdx !== -1) {
      // XHS: /user/profile/<userId>
      if (segments[userIdx + 1] === 'profile') {
        const userId = segments[userIdx + 2]
        return userId ?? null
      }
      // Douyin: /user/<userId>
      const userId = segments[userIdx + 1]
      return userId ?? null
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parses a URL and returns both the detected platform and the raw user
 * identifier extracted from the URL path. Returns null if the platform
 * cannot be determined.
 */
/**
 * @description 解析url
 * @param url - URL 地址
 * @returns ParsedUrl | null
 */
export function parseUrl(url: string): ParsedUrl | null {
  const pureUrl = extractPureUrl(url)
  if (!pureUrl) {
    return null
  }

  const platform = detectPlatform(pureUrl)
  if (platform === null) {
    return null
  }

  const rawUserId = extractUserId(pureUrl)
  return { platform, rawUserId, pureUrl }
}

/**
 * Checks if the URL is a video or note URL instead of an account profile.
 * Returns a user-friendly error message if it's a video/note link, or null if it's fine.
 */
/**
 * @description 检查urltype
 * @param url - URL 地址
 * @returns string | null
 */
export function checkUrlType(url: string): string | null {
  const pureUrl = extractPureUrl(url)
  if (!pureUrl) return null

  const lower = pureUrl.toLowerCase()
  if (lower.includes('xiaohongshu.com') || lower.includes('xhslink.com') || lower.includes('xhs.cn')) {
    if (lower.includes('/explore/') || lower.includes('/discovery/')) {
      return '您输入的是小红书笔记链接，本功能为【同行对标账号分析】，请输入账号的个人主页链接（包含 /user/profile/ 或分享短链）'
    }
  }

  if (lower.includes('douyin.com') || lower.includes('iesdouyin.com')) {
    if (lower.includes('/video/') || lower.includes('/note/')) {
      return '您输入的是抖音视频链接，本功能为【同行对标账号分析】，请输入账号的个人主页链接（包含 /user/ 或分享短链）'
    }
  }

  return null
}



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
 * 平台识别只认 **hostname 后缀**，绝不做整串子串匹配。
 *
 * 为什么必须按 hostname 判定（SSRF 根因）：
 * 原实现是 `lower.includes('douyin.com')`，于是
 * `https://169.254.169.254/latest/meta-data/?x=douyin.com` 会被判定为抖音链接。
 * 该 URL 会原样落库（`CompetitorAnalysis.targetUrl`），再被后台管线交给本地
 * Playwright 爬虫 —— 等于让**真浏览器**去访问攻击者指定的任意地址（含云 metadata、
 * 内网管理面、localhost 服务）。子串匹配还能被 `https://v.douyin.com@内网IP/`
 * （credential 段里的假 host）进一步绕过。
 */
const PLATFORM_HOST_SUFFIXES: ReadonlyArray<readonly [Platform, readonly string[]]> = [
  ['douyin', ['douyin.com', 'iesdouyin.com']],
  ['xiaohongshu', ['xiaohongshu.com', 'xhslink.com', 'xhs.cn']],
  ['wechat_channels', ['channels.weixin.qq.com', 'finder.video.qq.com']],
]

/** hostname 必须精确等于后缀，或以 `.`+后缀结尾（防 `douyin.com.evil.io` 这类判定欺骗）。 */
function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === suffix || host.endsWith(`.${suffix}`)
}

/**
 * 单个 URL 是否落在已支持平台的 hostname 白名单内。
 * 这是服务的**唯一**平台 URL 判定入口，其它模块（含本地爬虫的前置闸门）都复用它，
 * 避免各处各写一份导致再次漂移。
 */
export function isSupportedPlatformUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:') return false
    if (!hostname) return false
    return PLATFORM_HOST_SUFFIXES.some(([, suffixes]) =>
      suffixes.some((suffix) => hostMatchesSuffix(hostname, suffix)),
    )
  } catch {
    return false
  }
}

/**
 * Detects which social platform a URL belongs to.
 *
 * Supported platforms (MVP):
 *   - douyin:      douyin.com, iesdouyin.com
 *   - xiaohongshu: xiaohongshu.com, xhslink.com, xhs.cn
 *   - wechat_channels: channels.weixin.qq.com, finder.video.qq.com
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
    const { hostname } = new URL(pureUrl)

    for (const [platform, suffixes] of PLATFORM_HOST_SUFFIXES) {
      if (suffixes.some((suffix) => hostMatchesSuffix(hostname, suffix))) {
        return platform
      }
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

    // WeChat Channels: /web/pages/profile/<finder_username>
    const pagesIdx = segments.indexOf('pages')
    if (pagesIdx !== -1 && segments[pagesIdx + 1] === 'profile' && segments[pagesIdx + 2]) {
      return decodeURIComponent(segments[pagesIdx + 2])
    }

    // WeChat Channels: /mfinder/<finder_username>
    const finderIdx = segments.indexOf('mfinder')
    if (finderIdx !== -1 && segments[finderIdx + 1]) {
      return decodeURIComponent(segments[finderIdx + 1])
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

  // 平台与路径都按解析后的结构化字段判定：
  // 平台看 hostname 白名单（见 {@link detectPlatform}），路径看 pathname，
  // 避免 `/video/` 出现在 query 串里就被误判、也避免非支持 host 蹭到这条业务提示。
  const platform = detectPlatform(pureUrl)
  let pathname = ''
  try {
    pathname = new URL(pureUrl).pathname.toLowerCase()
  } catch {
    return null
  }

  if (platform === 'xiaohongshu') {
    if (pathname.startsWith('/explore/') || pathname.startsWith('/discovery/')) {
      return '您输入的是小红书笔记链接，本功能为【同行对标账号分析】，请输入账号的个人主页链接（包含 /user/profile/ 或分享短链）'
    }
  }

  if (platform === 'douyin') {
    if (pathname.startsWith('/video/') || pathname.startsWith('/note/')) {
      return '您输入的是抖音视频链接，本功能为【同行对标账号分析】，请输入账号的个人主页链接（包含 /user/ 或分享短链）'
    }
  }

  return null
}



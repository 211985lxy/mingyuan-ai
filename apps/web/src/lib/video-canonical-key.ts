/**
 * Canonical video key resolution.
 *
 * Resolves short-link URLs (Douyin v.douyin.com, Bilibili b23.tv) to their
 * canonical form and extracts platform-specific video IDs for content-level dedup.
 */

import { detectVideoPlatform } from "@/lib/video-text-extractor"

export interface CanonicalVideoKey {
  /** The resolved canonical URL (after following redirects for short links). */
  canonicalUrl: string
  /** Platform identifier: douyin, bilibili, kuaishou, xiaohongshu, channels, youtube. */
  platform: string
  /**
   * Platform-specific video ID extracted from the URL.
   * null when the URL is a short link that hasn't been resolved, or when
   * the platform/id pattern is unrecognized.
   */
  videoId: string | null
}

/**
 * Extract the canonical key for a video URL.
 *
 * For short links (v.douyin.com, b23.tv), this returns videoId=null because
 * resolution requires an HTTP call. Callers should resolve the short link first
 * if they need the videoId.
 *
 * For long-form URLs, extracts the video ID from the path/query params.
 */
/**
 * @description 提取canonicalvideokey
 * @param url - URL 地址
 * @returns CanonicalVideoKey
 */
export function extractCanonicalVideoKey(url: string): CanonicalVideoKey {
  const platform = detectVideoPlatform(url)
  const videoId = extractVideoId(url, platform)

  return {
    canonicalUrl: url,
    platform,
    videoId,
  }
}

/**
 * Build the canonicalSourceKey string used for content-level dedup.
 * Format: `{platform}:{videoId}` or null when videoId is unavailable.
 */
/**
 * @description 构建canonicalsourcekey
 * @param key - 键
 * @returns string | null
 */
export function buildCanonicalSourceKey(key: CanonicalVideoKey): string | null {
  if (!key.videoId) return null
  return `${key.platform}:${key.videoId}`
}

/**
 * Build a dedup-friendly source key directly from a URL.
 * Shortcut that combines extractCanonicalVideoKey + buildCanonicalSourceKey.
 */
/**
 * @description 解析canonicalsourcekey
 * @param url - URL 地址
 * @returns string | null
 */
export function resolveCanonicalSourceKey(url: string): string | null {
  const key = extractCanonicalVideoKey(url)
  return buildCanonicalSourceKey(key)
}

// ---------------------------------------------------------------------------
// Platform-specific video ID extraction
// ---------------------------------------------------------------------------

function extractVideoId(url: string, platform: string): string | null {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname
    const params = parsed.searchParams

    switch (platform) {
      // Douyin: /video/7xxxxxxxxx or /share/video/7xxxxxxxxx
      case "douyin": {
        const match = path.match(/\/video\/(\d+)/)
        if (match) return match[1]
        // Short link pattern: v.douyin.com/xxxxx — no extractable ID without redirect
        return null
      }

      // Bilibili: /video/BV1xxxxxxxx or /video/av123456
      case "bilibili": {
        const bvMatch = path.match(/\/video\/(BV[\w]+)/i)
        if (bvMatch) return bvMatch[1]
        const avMatch = path.match(/\/video\/av(\d+)/i)
        if (avMatch) return `av${avMatch[1]}`
        // Short link: b23.tv/xxxxx
        return null
      }

      // Kuaishou: /video/3xxxxxxxxx
      case "kuaishou": {
        const match = path.match(/\/video\/(\d{8,})/)
        if (match) return match[1]
        return null
      }

      // Xiaohongshu: /explore/xxxxx or /discovery/item/xxxxx
      case "xiaohongshu": {
        const noteMatch = path.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})/i)
        if (noteMatch) return noteMatch[1]
        return null
      }

      // WeChat Channels: channels.weixin.qq.com — no reliable ID from URL
      case "channels":
        return null

      // YouTube: watch?v=xxxxx or youtu.be/xxxxx
      case "youtube": {
        const vParam = params.get("v")
        if (vParam && /^[A-Za-z0-9_-]{11}$/.test(vParam)) return vParam
        // youtu.be short link
        if (parsed.hostname.includes("youtu.be")) {
          const seg = path.replace(/^\//, "").split(/[?#/]/)[0]
          if (seg && seg.length > 0) return seg
        }
        return null
      }

      default:
        return null
    }
  } catch {
    return null
  }
}

/**
 * 视频链接检测器 — 从飞书/公众号消息文本中提取视频链接。
 *
 * 支持平台：抖音、视频号（微信）、B站、快手、小红书、YouTube
 */

import { detectVideoPlatform } from "@/lib/video-text-extractor"

// ─── 链接正则 ──────────────────────────────────────────────────────

const DOUYIN_PATTERN =
  /https?:\/\/(?:v\.douyin\.com\/[A-Za-z0-9]+|www\.douyin\.com\/video\/\d+|(?:www\.)?douyin\.com\/note\/\d+)/g

const CHANNELS_PATTERN =
  /https?:\/\/channels\.weixin\.qq\.com\/[A-Za-z0-9/_.~?-]+/g

const BILIBILI_PATTERN =
  /https?:\/\/(?:www\.)?bilibili\.com\/video\/[A-Za-z0-9]+|https?:\/\/b23\.tv\/[A-Za-z0-9]+/g

const KUAISHOU_PATTERN =
  /https?:\/\/(?:www\.)?kuaishou\.com\/short-video\/[A-Za-z0-9]+|https?:\/\/v\.kuaishou\.com\/[A-Za-z0-9]+/g

const XHS_PATTERN =
  /https?:\/\/(?:www\.)?xiaohongshu\.com\/[A-Za-z0-9/_.~?-]+|https?:\/\/xhslink\.com\/[A-Za-z0-9]+/g

const YOUTUBE_PATTERN =
  /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]+|https?:\/\/youtu\.be\/[A-Za-z0-9_-]+/g

const ALL_VIDEO_PATTERNS: Array<{ pattern: RegExp; platform: string }> = [
  { pattern: DOUYIN_PATTERN, platform: "douyin" },
  { pattern: CHANNELS_PATTERN, platform: "channels" },
  { pattern: BILIBILI_PATTERN, platform: "bilibili" },
  { pattern: KUAISHOU_PATTERN, platform: "kuaishou" },
  { pattern: XHS_PATTERN, platform: "xiaohongshu" },
  { pattern: YOUTUBE_PATTERN, platform: "youtube" },
]

// ─── 导出类型 ──────────────────────────────────────────────────────

export interface DetectedVideoLink {
  url: string
  platform: string
  index: number
}

export interface VideoLinkDetectionResult {
  hasLinks: boolean
  links: DetectedVideoLink[]
  textWithoutLinks: string
}

// ─── 核心函数 ──────────────────────────────────────────────────────

export function detectVideoLinks(text: string): VideoLinkDetectionResult {
  if (!text || !text.trim()) {
    return { hasLinks: false, links: [], textWithoutLinks: text || "" }
  }

  const seen = new Set<string>()
  const links: DetectedVideoLink[] = []

  for (const { pattern, platform } of ALL_VIDEO_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) !== null) {
      const rawUrl = match[0]
      if (seen.has(rawUrl)) continue

      const cleanUrl = rawUrl.replace(/[),.。]+$/, "")
      if (!cleanUrl || seen.has(cleanUrl)) continue

      seen.add(cleanUrl)
      const confirmedPlatform = detectVideoPlatform(cleanUrl)

      links.push({ url: cleanUrl, platform: confirmedPlatform, index: match.index })
    }
  }

  const textWithoutLinks = text
    .replace(/https?:\/\/[^\s，。；、"'<>\u4e00-\u9fa5]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()

  return { hasLinks: links.length > 0, links, textWithoutLinks }
}

export function hasVideoLink(text: string): boolean {
  if (!text) return false
  for (const { pattern } of ALL_VIDEO_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(text)) return true
  }
  return false
}

export function extractFirstVideoUrl(text: string): DetectedVideoLink | null {
  const result = detectVideoLinks(text)
  return result.hasLinks ? result.links[0] : null
}
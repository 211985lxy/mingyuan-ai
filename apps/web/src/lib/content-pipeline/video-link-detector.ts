/**
 * 视频链接检测器 — 从飞书/公众号消息文本中提取视频链接。
 *
 * 支持平台：抖音、视频号（微信）、B站、快手、小红书、YouTube
 */

import { detectVideoPlatform, extractPureVideoUrl } from "@/lib/video-text-extractor"

// ─── 链接正则 ──────────────────────────────────────────────────────

/** 抖音：短链接 v.douyin.com 和作品页 www.douyin.com/video/ */
const DOUYIN_PATTERN =
  /https?:\/\/(?:v\.douyin\.com\/[A-Za-z0-9]+|www\.douyin\.com\/video\/\d+|(?:www\.)?douyin\.com\/note\/\d+)/g

/** 视频号：channels.weixin.qq.com 及微信相关短链 */
const CHANNELS_PATTERN =
  /https?:\/\/channels\.weixin\.qq\.com\/[A-Za-z0-9/_.~?-]+/g

/** B站 */
const BILIBILI_PATTERN =
  /https?:\/\/(?:www\.)?bilibili\.com\/video\/[A-Za-z0-9]+|https?:\/\/b23\.tv\/[A-Za-z0-9]+/g

/** 快手 */
const KUAISHOU_PATTERN =
  /https?:\/\/(?:www\.)?kuaishou\.com\/short-video\/[A-Za-z0-9]+|https?:\/\/v\.kuaishou\.com\/[A-Za-z0-9]+/g

/** 小红书 */
const XHS_PATTERN =
  /https?:\/\/(?:www\.)?xiaohongshu\.com\/[A-Za-z0-9/_.~?-]+|https?:\/\/xhslink\.com\/[A-Za-z0-9]+/g

/** YouTube */
const YOUTUBE_PATTERN =
  /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]+|https?:\/\/youtu\.be\/[A-Za-z0-9_-]+/g

/** 所有视频链接匹配模式（按优先级排列） */
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
  /** 提取到的原始 URL */
  url: string
  /** 平台标识（douyin / channels / bilibili / kuaishou / xiaohongshu / youtube） */
  platform: string
  /** 在原文中的起始索引 */
  index: number
}

export interface VideoLinkDetectionResult {
  /** 是否检测到至少一条视频链接 */
  hasLinks: boolean
  /** 所有检测到的视频链接 */
  links: DetectedVideoLink[]
  /** 去掉链接后的纯文本内容 */
  textWithoutLinks: string
}

// ─── 核心函数 ──────────────────────────────────────────────────────

/**
 * 从一段文本中检测所有视频链接，返回链接列表和清理后的文本。
 * 对每条链接，先用正则匹配，再用 detectVideoPlatform 二次确认平台。
 */
export function detectVideoLinks(text: string): VideoLinkDetectionResult {
  if (!text || !text.trim()) {
    return { hasLinks: false, links: [], textWithoutLinks: text || "" }
  }

  const seen = new Set<string>()
  const links: DetectedVideoLink[] = []

  for (const { pattern, platform } of ALL_VIDEO_PATTERNS) {
    // 重置 lastIndex（因为 pattern 使用了 g 标志）
    pattern.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) !== null) {
      const rawUrl = match[0]

      // 去重
      if (seen.has(rawUrl)) continue

      // 清理 URL（去掉尾部标点）
      const cleanUrl = rawUrl.replace(/[),.。]+$/, "")
      if (!cleanUrl || seen.has(cleanUrl)) continue

      seen.add(cleanUrl)

      // 二次平台确认
      const confirmedPlatform = detectVideoPlatform(cleanUrl)

      links.push({
        url: cleanUrl,
        platform: confirmedPlatform,
        index: match.index,
      })
    }
  }

  // 清理文本中的链接
  const textWithoutLinks = text.replace(
    /https?:\/\/[^\s，。；、"'<>\u4e00-\u9fa5]+/gi,
    "",
  ).replace(/\s{2,}/g, " ").trim()

  return {
    hasLinks: links.length > 0,
    links,
    textWithoutLinks,
  }
}

/**
 * 快速判断文本中是否包含视频链接（不需要完整解析）。
 */
export function hasVideoLink(text: string): boolean {
  if (!text) return false
  for (const { pattern } of ALL_VIDEO_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(text)) return true
  }
  return false
}

/**
 * 从消息文本中提取第一条视频链接（简化版，用于快速路由）。
 * 找不到时返回 null。
 */
export function extractFirstVideoUrl(text: string): DetectedVideoLink | null {
  const result = detectVideoLinks(text)
  return result.hasLinks ? result.links[0] : null
}

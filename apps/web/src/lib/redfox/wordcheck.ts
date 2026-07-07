/**
 * 多平台违禁词检测模块。
 *
 * 基于 RedFox API `/story/api/cozeSkill/sensitiveWordSearch` 提供的平台官方违禁词库，
 * 支持抖音、小红书、公众号三大平台的违禁词检测。
 *
 * 降级策略：RedFox 不可用时，保留本地 93 词库基础检测，不阻断文案生成。
 */

import { redfoxPost, hasRedFoxApiKey } from './client'

// ── 类型 ──

export type CompliancePlatform = 'douyin' | 'xiaohongshu' | 'wechat'

export interface Violation {
  /** 命中的违禁词 */
  word: string
  /** 在原文中的位置（字符偏移） */
  position: number
  /** 平台建议的替换词 */
  suggestion: string
}

export interface ComplianceResult {
  /** 是否通过（无违禁词） */
  passed: boolean
  /** 命中的违禁词列表 */
  violations: Violation[]
  /** 高亮标记后的内容（违禁词用 ** 包裹） */
  highlightedContent: string
  /** 数据来源 */
  source: 'redfox' | 'local_fallback'
}

// ── RedFox 响应类型 ──

interface RedFoxWordCheckResponse {
  /** 是否包含敏感词 */
  hasSensitiveWord?: boolean
  /** 敏感词列表 */
  sensitiveWords?: RedFoxSensitiveWord[]
  /** 替换后的安全文本 */
  safeContent?: string
}

interface RedFoxSensitiveWord {
  /** 敏感词 */
  word?: string
  /** 建议替换词 */
  replaceWord?: string
  /** 位置信息（部分接口提供） */
  index?: number
}

// ── 平台标识映射 ──

const PLATFORM_LABEL: Record<CompliancePlatform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '公众号',
}

// ── 核心方法 ──

/**
 * 通过 RedFox API 检测平台违禁词。
 *
 * @param content 待检测文案
 * @param platform 目标发布平台
 * @returns ComplianceResult
 */
export async function checkRedFoxSensitiveWords(input: {
  content: string
  platform: CompliancePlatform
}): Promise<ComplianceResult> {
  const { content, platform } = input

  if (!content.trim()) {
    return emptyResult('redfox')
  }

  if (!hasRedFoxApiKey()) {
    // 无 API Key 时降级到本地检测
    return localFallbackCheck(content, platform)
  }

  try {
    const data = await redfoxPost<RedFoxWordCheckResponse>(
      '/story/api/cozeSkill/sensitiveWordSearch',
      {
        content,
        platform,
        source: 'aim',
      },
    )

    const violations: Violation[] = Array.isArray(data.sensitiveWords)
      ? data.sensitiveWords.map((sw, idx) => ({
          word: sw.word || '',
          position: sw.index ?? findWordPosition(content, sw.word || '', 0),
          suggestion: sw.replaceWord || '',
        }))
      : []

    const highlighted = violations.length > 0
      ? highlightViolations(content, violations)
      : content

    return {
      passed: !data.hasSensitiveWord && violations.length === 0,
      violations,
      highlightedContent: highlighted,
      source: 'redfox',
    }
  } catch (err) {
    // RedFox 失败时降级到本地检测，不阻断
    console.warn('[wordcheck] RedFox 违禁词检测失败，降级到本地检测:', err)
    return localFallbackCheck(content, platform)
  }
}

/**
 * 本地兜底检测（基于现有 AI 味检测中的常见平台违禁词子集）。
 * 不阻断文案生成，仅做基础拦截。
 */
export function localFallbackCheck(
  content: string,
  platform: CompliancePlatform,
): ComplianceResult {
  // 常见平台高风险词汇（精简子集，覆盖广告法/医美/金融等）
  const localWordMap: Record<CompliancePlatform, string[]> = {
    douyin: [
      '最便宜', '最好', '国家级', '特效药', '包治百病',
      '零风险', '稳赚', '秒到账', '加微信', '私聊下单',
    ],
    xiaohongshu: [
      '最便宜', '最好', '国家级', '特效药', '包治百病',
      '加微信', '私聊下单', '好评返现', '刷单',
    ],
    wechat: [
      '最便宜', '最好', '国家级', '特效药', '包治百病',
      '加微信', '私聊下单', '稳赚不赔', '保证收益',
    ],
  }

  const blockedWords = localWordMap[platform] || []
  const violations: Violation[] = []

  for (const word of blockedWords) {
    let pos = 0
    while ((pos = content.indexOf(word, pos)) !== -1) {
      violations.push({
        word,
        position: pos,
        suggestion: '[建议修改]',
      })
      pos += word.length
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    highlightedContent: violations.length > 0
      ? highlightViolations(content, violations)
      : content,
    source: 'local_fallback',
  }
}

/**
 * 检查 RedFox API 是否可用（用于前端提示）。
 */
export function hasWordCheckApi(): boolean {
  return hasRedFoxApiKey()
}

// ── 工具函数 ──

function emptyResult(source: 'redfox' | 'local_fallback'): ComplianceResult {
  return { passed: true, violations: [], highlightedContent: '', source }
}

function findWordPosition(content: string, word: string, startFrom: number): number {
  return content.indexOf(word, startFrom)
}

/**
 * 在原文中高亮违禁词（用 ** 包裹）。
 * 从后往前替换，避免位置偏移。
 */
function highlightViolations(content: string, violations: Violation[]): string {
  if (violations.length === 0) return content

  // 按位置降序排序，从后往前替换
  const sorted = [...violations].sort((a, b) => b.position - a.position)
  let result = content

  for (const v of sorted) {
    if (v.position >= 0 && v.word) {
      const before = result.slice(0, v.position)
      const word = result.slice(v.position, v.position + v.word.length)
      const after = result.slice(v.position + v.word.length)
      result = `${before}**${word}**${after}`
    }
  }

  return result
}

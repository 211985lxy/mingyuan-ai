/**
 * 内容创作台：长文粘贴识别与用途装配（仅客户端状态，不进 Agent 契约）。
 */

import type { AimAgentCapabilities, AimPasteMode } from "@/lib/aim/agent-capabilities"
import { splitScripts } from "@/lib/aim/script-structure-extractor-types"

export type PasteUsage = "edit" | "review" | "benchmark" | "style_sample" | "analytics"

export interface PastedCopyAttachment {
  content: string
  charCount: number
  usage?: PasteUsage
}

/** 按能力矩阵决定长文粘贴可选用途；plain 返回空（不接管粘贴）。 */
export function getAllowedPasteUsages(capabilities: AimAgentCapabilities): PasteUsage[] {
  if (capabilities.pasteMode === "plain") return []
  if (capabilities.pasteMode === "edit") return ["edit"]
  if (capabilities.pasteMode === "review") return ["review"]
  if (capabilities.pasteMode === "analytics") return ["analytics"]
  const usages: PasteUsage[] = ["edit"]
  if (capabilities.benchmarkReference) usages.push("benchmark")
  if (capabilities.styleSample) usages.push("style_sample")
  return usages
}

/**
 * edit/review/analytics 模式：长文粘贴自动带用途，可直接发送。
 * creative：保留推断；若无推断则等用户点选。
 * plain：不应调用（调用方应跳过接管）。
 */
export function resolveInitialPasteUsage(input: {
  pasteMode: AimPasteMode
  instruction?: string
  allowedUsages: PasteUsage[]
}): PasteUsage | undefined {
  const { pasteMode, instruction = "", allowedUsages } = input
  if (pasteMode === "plain" || allowedUsages.length === 0) return undefined
  if (pasteMode === "edit") return allowedUsages.includes("edit") ? "edit" : allowedUsages[0]
  if (pasteMode === "review") return allowedUsages.includes("review") ? "review" : allowedUsages[0]
  if (pasteMode === "analytics") {
    return allowedUsages.includes("analytics") ? "analytics" : allowedUsages[0]
  }
  const inferred = inferPasteUsageFromInstruction(instruction)
  if (inferred && allowedUsages.includes(inferred)) return inferred
  return undefined
}

/** 复盘：短导出文档也要接管（不必满 300 字）。 */
export function isAnalyticsPasteCandidate(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isLongCopyPaste(trimmed)) return true
  return /播放|点赞|评论|收藏|分享|转发|私信|线索|成交|营收/.test(trimmed)
    && /\d/.test(trimmed)
    && trimmed.length >= 12
}

/** 正文不少于 300 字，或至少 6 行非空文本 → 长文附件 */
export const LONG_COPY_MIN_CHARS = 300
export const LONG_COPY_MIN_NONEMPTY_LINES = 6

export function countNonEmptyLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length
}

export function isLongCopyPaste(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return trimmed.length >= LONG_COPY_MIN_CHARS || countNonEmptyLines(trimmed) >= LONG_COPY_MIN_NONEMPTY_LINES
}

export function createPastedCopyAttachment(content: string, usage?: PasteUsage): PastedCopyAttachment {
  const trimmed = content.trim()
  return {
    content: trimmed,
    charCount: trimmed.length,
    usage,
  }
}

/** 从用户指令文本推断粘贴用途；裸粘贴返回 undefined */
export function inferPasteUsageFromInstruction(instruction: string): PasteUsage | undefined {
  const text = instruction.trim()
  if (!text) return undefined

  if (/(这是我以前写的|记住这种风格|以后按这个感觉|沉淀.*风格|学我的.*风格|记住我的.*口吻|按我的风格)/.test(text)) {
    return "style_sample"
  }
  if (/(按这篇仿写|参考结构|对标重写|对标仿写|仿写这篇|参考这篇|按对标|照着这篇)/.test(text)) {
    return "benchmark"
  }
  if (/(修改这篇|优化这篇|润色这篇|改这篇|帮我改|帮我优化|帮我润色|修改一下|优化一下|润色一下)/.test(text)) {
    return "edit"
  }
  return undefined
}

export function formatCharCount(count: number): string {
  return count.toLocaleString("zh-CN")
}

/**
 * 将附件装配进发送文本。
 * style_sample 不应走生成，调用方应拦截。
 */
export function assemblePasteUsageInput(input: {
  instruction: string
  attachment: PastedCopyAttachment
}): string | null {
  const { instruction, attachment } = input
  const usage = attachment.usage
  if (!usage) return null
  const body = attachment.content.trim()
  if (!body) return null

  if (usage === "edit") {
    const lead = instruction.trim() || "请优化修改下面这篇文案，直接给出可发布终稿。"
    return `${lead}\n\n【待修改原文】\n${body}`
  }

  if (usage === "review") {
    const lead = instruction.trim() || "请对下面文案做发布质检，只指出风险和最小修改建议，不要整篇重写。"
    return `${lead}\n\n【待质检原文】\n${body}`
  }

  if (usage === "benchmark") {
    const lead = instruction.trim() || "请按对标原文重新生成一版文案，直接输出最终稿。"
    return `${lead}\n\n对标原文：\n${body}`
  }

  if (usage === "analytics") {
    const lead = instruction.trim() || "请基于下面这份已登记的发布数据做内容数据复盘。"
    return `${lead}\n\n【发布数据原文】\n${body}`
  }

  return null
}

export function canSubmitWithPasteAttachment(input: {
  text: string
  attachment: PastedCopyAttachment | null
  hasImages?: boolean
  hasFiles?: boolean
}): boolean {
  const { text, attachment, hasImages, hasFiles } = input
  if (attachment && !attachment.usage) return false
  if (attachment?.usage === "style_sample") return false
  return text.trim().length > 0 || Boolean(attachment) || Boolean(hasImages) || Boolean(hasFiles)
}

// ─── 批量复刻识别 ──────────────────────────────────────────

/** 批量复刻最少文案条数：少于 2 条不视为批量。 */
export const BATCH_REPLICATE_MIN_SCRIPTS = 2
/** 批量复刻单条文案最少字数：避免短文本误判。 */
export const BATCH_REPLICATE_MIN_SCRIPT_CHARS = 50

/** 指令里出现这些关键词时不走批量复刻（让位给 edit/review/analytics）。 */
const BATCH_REPLICATE_EXCLUDE_PATTERN =
  /(修改这篇|优化这篇|润色这篇|帮我改|帮我优化|帮我润色|质检|复盘|发布数据|记住.*风格|沉淀.*风格|按我的风格)/

/**
 * 判断粘贴内容是否为「批量复刻」候选：
 *  - splitScripts 切出 ≥ 2 条文案
 *  - 每条文案 ≥ BATCH_REPLICATE_MIN_SCRIPT_CHARS 字
 *  - 指令不含 edit/review/analytics/style_sample 关键词
 *
 * 由 content_producer 的 handleComposerGenerate 前置调用，
 * 命中后走 runBatchReplicateSend，不进标准意图门闩。
 */
export function isBatchReplicateCandidate(input: {
  content: string
  instruction?: string
}): boolean {
  const { content, instruction = "" } = input
  const trimmed = content.trim()
  if (!trimmed) return false
  if (BATCH_REPLICATE_EXCLUDE_PATTERN.test(instruction.trim())) return false
  const scripts = splitScripts(trimmed)
  if (scripts.length < BATCH_REPLICATE_MIN_SCRIPTS) return false
  return scripts.every((s) => s.length >= BATCH_REPLICATE_MIN_SCRIPT_CHARS)
}

export const PASTE_COMPOSER_PLACEHOLDER =
  "粘贴选题、原稿、老板口述或对标文案，也可以直接说你想写什么……"

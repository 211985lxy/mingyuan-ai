import type { ChatContent } from "@/lib/llm/types"

export const AIM_CONTEXT_CAPACITY_TOKENS = 200_000

const CJK_CHAR = /[\u3400-\u9fff\uf900-\ufaff]/
const ASCII_RUN = /[A-Za-z0-9]+/g
const IMAGE_CONTEXT_TOKENS = 1200
const MESSAGE_OVERHEAD_TOKENS = 12
export const FIXED_PROMPT_BUFFER_TOKENS = 800

function stripTrailingZero(value: string) {
  return value.replace(/\.0$/, "")
}

/**
 * @description 估算文本的 Token 数量（中英文混合估算策略）
 * @param text - 待估算的文本
 * @returns 估算的 Token 数
 */
export function estimateTokensFromText(text: string): number {
  if (!text.trim()) return 0

  let tokens = 0
  const asciiRuns = text.match(ASCII_RUN) ?? []
  for (const run of asciiRuns) tokens += Math.ceil(run.length / 4)

  let punctuation = 0
  for (const char of text.replace(ASCII_RUN, "")) {
    if (!char.trim()) continue
    if (CJK_CHAR.test(char)) {
      tokens += 1
      continue
    }
    punctuation += 1
  }

  tokens += Math.ceil(punctuation * 0.5)
  return tokens
}

/**
 * @description 估算消息内容的 Token 数量（支持文本和多模态内容）
 * @param content - 消息内容（字符串或多模态内容数组）
 * @returns 估算的 Token 数
 */
export function estimateTokensFromContent(content: ChatContent | string | undefined | null): number {
  if (!content) return 0
  if (typeof content === "string") return estimateTokensFromText(content)

  let tokens = 0
  for (const part of content) {
    if (part.type === "text") tokens += estimateTokensFromText(part.text)
    if (part.type === "image_url") tokens += IMAGE_CONTEXT_TOKENS
  }
  return tokens
}

function countImageParts(content: ChatContent | string | undefined | null): number {
  if (!content || typeof content === "string") return 0
  return content.reduce((sum, part) => sum + (part.type === "image_url" ? 1 : 0), 0)
}

function estimateTextOnlyTokens(content: ChatContent | string | undefined | null): number {
  if (!content) return 0
  if (typeof content === "string") return estimateTokensFromText(content)
  return content.reduce((sum, part) => {
    if (part.type !== "text") return sum
    return sum + estimateTokensFromText(part.text)
  }, 0)
}

/**
 * @description 估算完整上下文的 Token 总量（消息 + 知识块 + 固定提示词缓冲）
 * @param input - 上下文输入（消息列表、知识块、固定缓冲量）
 * @returns 估算的总 Token 数
 */
export function estimateContextTokens(input: {
  messages?: Array<{ content?: ChatContent | string | null }>
  blocks?: Array<string | undefined | null>
  fixedPromptBuffer?: number
}): number {
  const messageTokens = (input.messages ?? []).reduce((sum, message) => {
    return sum + estimateTokensFromContent(message.content) + MESSAGE_OVERHEAD_TOKENS
  }, 0)

  const blockTokens = (input.blocks ?? []).reduce((sum, block) => {
    return sum + estimateTokensFromText(block ?? "")
  }, 0)

  return messageTokens + blockTokens + (input.fixedPromptBuffer ?? FIXED_PROMPT_BUFFER_TOKENS)
}

export type AimContextUsageSegmentId =
  | "conversation"
  | "current_input"
  | "pasted_copy"
  | "images"
  | "system_reserve"

export interface AimContextUsageSegment {
  id: AimContextUsageSegmentId
  label: string
  tokens: number
}

export interface AimContextUsageBreakdown {
  segments: AimContextUsageSegment[]
  usedTokens: number
}

const SEGMENT_LABELS: Record<AimContextUsageSegmentId, string> = {
  conversation: "对话记录",
  current_input: "当前输入",
  pasted_copy: "粘贴素材",
  images: "图片",
  system_reserve: "系统预留",
}

/**
 * @description 按前端可观测来源拆分背景信息占用（对话 / 输入 / 粘贴 / 图片 / 系统预留）
 * @param input - 分类输入
 * @returns 分段列表与总量；总量与把同类内容塞进 estimateContextTokens 的结果对齐
 */
export function estimateContextUsageBreakdown(input: {
  conversation?: Array<{
    content?: ChatContent | string | null
    imageCount?: number
  }>
  currentInput?: string | null
  pastedCopy?: string | null
  fixedPromptBuffer?: number
}): AimContextUsageBreakdown {
  let conversationTokens = 0
  let imageTokens = 0

  for (const message of input.conversation ?? []) {
    conversationTokens += estimateTextOnlyTokens(message.content) + MESSAGE_OVERHEAD_TOKENS
    const fromContent = countImageParts(message.content)
    const fromCount = Math.max(0, message.imageCount ?? 0)
    // Prefer explicit imageCount when content is plain text; otherwise count multimodal parts.
    const images = typeof message.content === "string" || !message.content
      ? fromCount
      : Math.max(fromContent, fromCount)
    imageTokens += images * IMAGE_CONTEXT_TOKENS
  }

  const inputText = input.currentInput?.trim() ?? ""
  const currentInputTokens = inputText
    ? estimateTokensFromText(inputText) + MESSAGE_OVERHEAD_TOKENS
    : 0

  const pastedText = input.pastedCopy?.trim() ?? ""
  const pastedCopyTokens = pastedText
    ? estimateTokensFromText(pastedText) + MESSAGE_OVERHEAD_TOKENS
    : 0

  const systemReserveTokens = input.fixedPromptBuffer ?? FIXED_PROMPT_BUFFER_TOKENS

  const segments: AimContextUsageSegment[] = [
    { id: "conversation", label: SEGMENT_LABELS.conversation, tokens: conversationTokens },
    { id: "current_input", label: SEGMENT_LABELS.current_input, tokens: currentInputTokens },
    { id: "pasted_copy", label: SEGMENT_LABELS.pasted_copy, tokens: pastedCopyTokens },
    { id: "images", label: SEGMENT_LABELS.images, tokens: imageTokens },
    { id: "system_reserve", label: SEGMENT_LABELS.system_reserve, tokens: systemReserveTokens },
  ]

  const usedTokens = segments.reduce((sum, segment) => sum + segment.tokens, 0)
  return { segments, usedTokens }
}

/**
 * @description 将 Token 数格式化为中文显示（超过 1 万显示为“X万”）
 * @param tokens - Token 数量
 * @returns 格式化后的中文字符串
 */
export function formatChineseTokenCount(tokens: number): string {
  if (tokens >= 10_000) return `${stripTrailingZero((tokens / 10_000).toFixed(1))}万`
  return `${Math.max(0, Math.round(tokens))}`
}

/**
 * @description 格式化上下文容量标签（已用/总量 + 百分比）
 * @param usedTokens - 已使用的 Token 数
 * @param capacityTokens - 总容量 Token 数
 * @returns 格式化的容量标签字符串
 */
export function formatContextCapacityLabel(usedTokens: number, capacityTokens = AIM_CONTEXT_CAPACITY_TOKENS): string {
  const safeCapacity = Math.max(1, capacityTokens)
  const percent = ((usedTokens / safeCapacity) * 100).toFixed(1)
  return `${formatChineseTokenCount(usedTokens)} / ${formatChineseTokenCount(safeCapacity)} (${percent}%)`
}

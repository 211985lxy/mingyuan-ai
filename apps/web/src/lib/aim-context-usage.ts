import type { ChatContent } from "@/lib/llm/types"

export const AIM_CONTEXT_CAPACITY_TOKENS = 200_000

const CJK_CHAR = /[\u3400-\u9fff\uf900-\ufaff]/
const ASCII_RUN = /[A-Za-z0-9]+/g
const IMAGE_CONTEXT_TOKENS = 1200
const FIXED_PROMPT_BUFFER_TOKENS = 800

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
    return sum + estimateTokensFromContent(message.content) + 12
  }, 0)

  const blockTokens = (input.blocks ?? []).reduce((sum, block) => {
    return sum + estimateTokensFromText(block ?? "")
  }, 0)

  return messageTokens + blockTokens + (input.fixedPromptBuffer ?? FIXED_PROMPT_BUFFER_TOKENS)
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


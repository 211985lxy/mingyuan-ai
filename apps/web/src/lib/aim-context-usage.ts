import type { ChatContent } from "@/lib/llm/types"

export const AIM_CONTEXT_CAPACITY_TOKENS = 200_000

const CJK_CHAR = /[\u3400-\u9fff\uf900-\ufaff]/
const ASCII_RUN = /[A-Za-z0-9]+/g
const IMAGE_CONTEXT_TOKENS = 1200
const FIXED_PROMPT_BUFFER_TOKENS = 800

function stripTrailingZero(value: string) {
  return value.replace(/\.0$/, "")
}

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

export function formatChineseTokenCount(tokens: number): string {
  if (tokens >= 10_000) return `${stripTrailingZero((tokens / 10_000).toFixed(1))}万`
  return `${Math.max(0, Math.round(tokens))}`
}

export function formatContextCapacityLabel(usedTokens: number, capacityTokens = AIM_CONTEXT_CAPACITY_TOKENS): string {
  const safeCapacity = Math.max(1, capacityTokens)
  const percent = ((usedTokens / safeCapacity) * 100).toFixed(1)
  return `${formatChineseTokenCount(usedTokens)} / ${formatChineseTokenCount(safeCapacity)} (${percent}%)`
}


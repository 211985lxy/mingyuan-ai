import { env } from "@/env"
import { createGatewayLLM } from "@/lib/llm/gateway-client"
import { CROSS_GATEWAY_MODELS } from "@/lib/llm/models"
import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_KEYS } from "@/lib/prompt/types"

const DEFAULT_MODEL = env.SCRIPT_GENERATION_MODEL || CROSS_GATEWAY_MODELS.claudeSonnet
const DEFAULT_CHUNK_CHARS = 4500
const MIN_SOURCE_CHARS = 8

export interface PolishTranscriptOptions {
  /** 单次送入模型的最大字符数，超出则分块处理。默认 4500。 */
  chunkChars?: number
  /** 覆盖默认校对模型。 */
  model?: string
}

/**
 * 对 ASR / 视频文案提取结果做轻量 AI 润色：纠错 + 理顺语句，保留原意与口语风格。
 * LLM 不可用或失败时原样返回，不阻断主流程。
 */
export async function polishTranscript(
  text: string,
  options: PolishTranscriptOptions = {},
): Promise<string> {
  const source = text.trim()
  if (source.length < MIN_SOURCE_CHARS) return source

  const llm = createGatewayLLM()
  if (!llm.available) return source

  const chunkChars = options.chunkChars ?? DEFAULT_CHUNK_CHARS
  const model = options.model ?? DEFAULT_MODEL
  const chunks = splitTranscriptChunks(source, chunkChars)

  try {
    const polishedChunks: string[] = []
    for (const chunk of chunks) {
      const polished = await polishChunk(llm, model, chunk)
      polishedChunks.push(polished)
    }
    const joined = polishedChunks.join("\n").trim()
    if (!joined) return source
    // 结果明显过短时视为模型误总结，回退原文
    if (joined.length < Math.max(MIN_SOURCE_CHARS, Math.floor(source.length * 0.45))) {
      return source
    }
    return joined
  } catch {
    return source
  }
}

/** @deprecated 使用 polishTranscript；保留别名兼容语音转写调用方。 */
export const correctAsrText = polishTranscript

async function polishChunk(
  llm: ReturnType<typeof createGatewayLLM>,
  model: string,
  chunk: string,
): Promise<string> {
  const maxTokens = Math.min(8000, Math.max(800, Math.ceil(chunk.length * 1.3) + 200))
  const result = await llm.complete({
    model,
    // system prompt 已资产化（Prompt Registry）：DB 版本优先，兜底内置 seed v1（逐字原文）
    messages: promptRegistry.getMessages(PROMPT_KEYS.transcriptPolish, chunk),
    temperature: 0.1,
    maxTokens,
  })
  const polished = result.content.trim()
  return polished || chunk
}

/** 按段落/句末标点切块，尽量避免在句子中间截断。 */
export function splitTranscriptChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const parts = text.split(/(?<=[。！？；\n])/)
  const chunks: string[] = []
  let current = ""

  for (const part of parts) {
    if (!part) continue
    if (current && current.length + part.length > maxChars) {
      chunks.push(current)
      current = part
      continue
    }
    current += part
  }
  if (current) chunks.push(current)

  // 极端情况：单段超长且无标点，硬切
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk]
    const hard: string[] = []
    for (let i = 0; i < chunk.length; i += maxChars) {
      hard.push(chunk.slice(i, i + maxChars))
    }
    return hard
  })
}

import { createGatewayLLM } from "@/lib/llm/gateway-client"
import { CROSS_GATEWAY_MODELS } from "@/lib/llm/models"
import { splitTranscriptChunks } from "@/lib/transcript-polish"
import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_KEYS } from "@/lib/prompt/types"
import type { ChatMessage, CompletionResult } from "@/lib/llm/types"

const MAX_CHUNK_CHARS = 6_000
const MIN_RETENTION_RATIO = 0.45

export interface PurifiedTranscript {
  markdown: string
  usedFallback: boolean
}

export interface TranscriptCompletionDeps {
  complete?: (messages: ChatMessage[]) => Promise<Pick<CompletionResult, "content">>
}

function isAbnormallyShort(source: string, output: string): boolean {
  return !output || output.length < Math.floor(source.length * MIN_RETENTION_RATIO)
}

async function completeChunk(
  title: string | undefined,
  source: string,
  complete: (messages: ChatMessage[]) => Promise<Pick<CompletionResult, "content">>,
): Promise<string> {
  const messages = promptRegistry.getMessages(
    PROMPT_KEYS.mediaTranscriptPurify,
    `素材标题：${title || "未知"}\n\n转录稿：\n${source}`,
  )
  const output = (await complete(messages)).content.trim()
  return isAbnormallyShort(source, output) ? source : output
}

export async function purifyMediaTranscript(
  input: { title?: string; transcript: string },
  deps: TranscriptCompletionDeps = {},
): Promise<PurifiedTranscript> {
  const source = input.transcript.trim()
  if (!source) throw new Error("EMPTY_TRANSCRIPT")

  const complete = deps.complete ?? (async (messages: ChatMessage[]) => {
    const llm = createGatewayLLM()
    if (!llm.available) throw new Error("PURIFICATION_FAILED")
    return llm.complete({
      model: CROSS_GATEWAY_MODELS.claudeSonnet,
      messages,
      temperature: 0.1,
      maxTokens: 12_000,
    })
  })

  const chunks = splitTranscriptChunks(source, MAX_CHUNK_CHARS)
  try {
    const outputs: string[] = []
    for (const chunk of chunks) {
      outputs.push(await completeChunk(input.title, chunk, complete))
    }
    const markdown = outputs.join("\n\n").trim()
    return { markdown: markdown || source, usedFallback: outputs.some((output, index) => output === chunks[index]) }
  } catch (error) {
    if (error instanceof Error && error.message === "PURIFICATION_FAILED") throw error
    return { markdown: source, usedFallback: true }
  }
}

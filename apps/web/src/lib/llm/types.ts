export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: ChatContent
}

export type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >

export interface CompletionOptions {
  model?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: { type: "json_object" } | { type: "text" }
  stream?: false
}

export interface CompletionUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** Tokens served from prompt cache (e.g. DeepSeek/OpenAI prompt_tokens_details.cached_tokens). */
  cachedTokens?: number
}

export interface CompletionResult {
  content: string
  model: string
  provider: string
  usage?: CompletionUsage
}

/**
 * A single chunk emitted by a streaming provider.
 * - `delta`: incremental text (same semantics as the old `AsyncIterable<string>`).
 * - `usage`: present on the final chunk when `stream_options.include_usage` is set.
 */
export interface StreamChunk {
  delta?: string
  usage?: CompletionUsage
  /** Echoed model name from the stream's final chunk, when available. */
  responseModel?: string
}

export interface LLMProviderConfig {
  name: string
  apiKey: string
  baseURL: string
  defaultModel: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
}

export interface LLMProvider {
  readonly name: string
  /** Configured model used when CompletionOptions.model is omitted. */
  readonly defaultModel?: string
  complete(options: CompletionOptions): Promise<CompletionResult>
  stream?(options: CompletionOptions): AsyncIterable<StreamChunk>
  isAvailable(): boolean
}

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

export interface CompletionResult {
  content: string
  model: string
  provider: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export type ModelCapability = "basic" | "standard" | "advanced"

export interface LLMProviderConfig {
  name: string
  apiKey: string
  baseURL: string
  defaultModel: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
  capability?: ModelCapability
}

export interface LLMProvider {
  readonly name: string
  /** Configured model used when CompletionOptions.model is omitted. */
  readonly defaultModel?: string
  /** Operational capability tier used by AIM routing and telemetry. */
  readonly capability?: ModelCapability
  complete(options: CompletionOptions): Promise<CompletionResult>
  stream?(options: CompletionOptions): AsyncIterable<string>
  isAvailable(): boolean
}

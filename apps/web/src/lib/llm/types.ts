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
  /** 模型停止原因；length 表示输出预算耗尽，正文可能被截断。 */
  finishReason?: string | null
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
  proxyURL?: string
  timeoutMs?: number
  maxRetries?: number
  capability?: ModelCapability
  /**
   * 聚合网关/中转站：认识跨网关模型名（vendor/model，如 anthropic/claude-sonnet-4.6）
   * 以及各家原生模型名。直连供应商（deepseek/glm/qianfan/openai）必须声明
   * ownModelPrefixes，路由前按前缀过滤，避免把别家模型名发过去吃 400。
   */
  isGateway?: boolean
  /** 直连供应商的自家模型名前缀（小写）；缺省视为不过滤（保持旧行为） */
  ownModelPrefixes?: string[]
}

export interface LLMProvider {
  readonly name: string
  /** Configured model used when CompletionOptions.model is omitted. */
  readonly defaultModel?: string
  /** Operational capability tier used by AIM routing and telemetry. */
  readonly capability?: ModelCapability
  /** 是否认识给定模型名；用于发请求前过滤，防止模型名-供应商错配 400 */
  supportsModel?(model: string): boolean
  complete(options: CompletionOptions): Promise<CompletionResult>
  stream?(options: CompletionOptions): AsyncIterable<string>
  isAvailable(): boolean
}

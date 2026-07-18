import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import type {
  CompletionOptions,
  CompletionResult,
  CompletionUsage,
  LLMProvider,
  LLMProviderConfig,
  StreamChunk,
} from "./types"

/**
 * Map OpenAI-style usage payload to our CompletionUsage, extracting the
 * prompt-cache hit count when the provider reports it (DeepSeek / OpenAI
 * expose it under prompt_tokens_details.cached_tokens).
 */
function mapUsage(raw: OpenAI.CompletionUsage | null | undefined): CompletionUsage | undefined {
  if (!raw) return undefined
  const cached =
    (raw as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details
      ?.cached_tokens
  return {
    promptTokens: raw.prompt_tokens,
    completionTokens: raw.completion_tokens,
    totalTokens: raw.total_tokens,
    cachedTokens: typeof cached === "number" ? cached : undefined,
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string
  private client: OpenAI
  readonly defaultModel: string
  private apiKey: string

  constructor(config: LLMProviderConfig) {
    this.name = config.name
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      timeout: config.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS || 60000),
    })
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const model = options.model || this.defaultModel

    const response = await this.client.chat.completions.create({
      model,
      messages: options.messages as ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat,
      stream: false,
    })

    const choice = response.choices[0]
    if (!choice?.message?.content) {
      throw new Error(`[${this.name}] Empty response from model ${model}`)
    }

    return {
      content: choice.message.content,
      model: response.model,
      provider: this.name,
      usage: mapUsage(response.usage),
    }
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const model = options.model || this.defaultModel

    const response = await this.client.chat.completions.create({
      model,
      messages: options.messages as ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat,
      stream: true,
      // Request the usage payload on the final chunk so streaming calls can be
      // metered for cost. Harmless for providers that ignore the option.
      stream_options: { include_usage: true },
    })

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content
      // OpenAI-compatible providers emit usage (and the echoed model name) on the
      // terminal chunk when include_usage is set. chunk.model is populated on
      // every chunk by some providers and only the last by others.
      const chunkModel = chunk.model
      const usage = mapUsage((chunk as { usage?: OpenAI.CompletionUsage }).usage)
      if (delta || usage || chunkModel) {
        yield {
          ...(delta ? { delta } : {}),
          ...(usage ? { usage } : {}),
          ...(chunkModel ? { responseModel: chunkModel } : {}),
        }
      }
    }
  }
}

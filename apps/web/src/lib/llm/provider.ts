import { env } from "@/env"
import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import type {
  CompletionOptions,
  CompletionResult,
  LLMProvider,
  LLMProviderConfig,
} from "./types"

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string
  readonly capability?: LLMProviderConfig["capability"]
  private client: OpenAI
  readonly defaultModel: string
  private apiKey: string

  constructor(config: LLMProviderConfig) {
    this.name = config.name
    this.capability = config.capability
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      timeout: config.timeoutMs ?? Number(env.LLM_TIMEOUT_MS || 60000),
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
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    }
  }

  async *stream(options: CompletionOptions): AsyncIterable<string> {
    const model = options.model || this.defaultModel

    const response = await this.client.chat.completions.create({
      model,
      messages: options.messages as ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat,
      stream: true,
    })

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  }
}

import { env } from "@/env"
import OpenAI, { type ClientOptions } from "openai"
import { type ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { ProxyAgent } from "undici"
import type {
  CompletionOptions,
  CompletionResult,
  LLMProvider,
  LLMProviderConfig,
} from "./types"

/**
 * 进程级 ProxyAgent 复用池。
 *
 * 历史 Bug：OpenAICompatibleProvider 构造函数每次都 `new ProxyAgent(...)`，
 * 而 `getAgentLLM()` 走热路径且不缓存 provider（每次请求都重建整条链），
 * 导致每个带代理的 LLM 请求都泄漏一个 undici 连接池 + 其持有的 socket/FD，
 * 长驻 ECS 进程会累积成句柄与内存泄漏。
 *
 * 修复：同一代理 URL 全进程共享一个 ProxyAgent；进程退出前可调用
 * `destroySharedProxyAgents()` 显式回收（不回收也仅随进程一同被 OS 回收）。
 */
const sharedProxyAgents = new Map<string, ProxyAgent>()

/**
 * 复用（必要时创建）给定代理 URL 的 ProxyAgent。
 * 仅在 `proxyURL` 非空时使用；返回的 dispatcher 由本模块单例持有。
 */
export function getSharedProxyAgent(proxyURL: string): ProxyAgent {
  let agent = sharedProxyAgents.get(proxyURL)
  if (!agent) {
    agent = new ProxyAgent(proxyURL)
    sharedProxyAgents.set(proxyURL, agent)
  }
  return agent
}

/**
 * 显式销毁所有共享 ProxyAgent（优雅关闭时调用；测试间可调用以隔离状态）。
 * 销毁后缓存清空，下次获取会按需重建。
 */
export function destroySharedProxyAgents(): void {
  for (const agent of sharedProxyAgents.values()) {
    agent.destroy().catch(() => {
      /* 忽略：进程关闭期间 dispatcher 可能已不可用 */
    })
  }
  sharedProxyAgents.clear()
}

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
    const fetchOptions = config.proxyURL
      ? ({ dispatcher: getSharedProxyAgent(config.proxyURL) } as ClientOptions["fetchOptions"])
      : undefined
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      fetchOptions,
      timeout: config.timeoutMs ?? Number(env.LLM_TIMEOUT_MS || 60000),
      maxRetries: config.maxRetries,
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
      finishReason: choice.finish_reason,
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

import { env } from "@/env"
import OpenAI, { type ClientOptions } from "openai"
import { type ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { ProxyAgent } from "undici"
import {
  attachLiveThinking,
  getActiveAimTraceId,
  isShowLiveThinkingEnabled,
} from "@/lib/aim/live-thinking"
import { getAimExecutionDeadline, resolveProviderTimeoutMs } from "./execution-deadline"
import type {
  CompletionOptions,
  CompletionResult,
  LLMProvider,
  LLMProviderConfig,
} from "./types"

type AssistantDelta = { content?: string | null; reasoning_content?: string | null }

function readAssistantDelta(chunk: {
  choices?: Array<{ delta?: AssistantDelta; finish_reason?: string | null }>
  model?: string
}) {
  const choice = chunk.choices?.[0]
  const delta = choice?.delta
  return {
    content: typeof delta?.content === "string" ? delta.content : "",
    reasoning: typeof delta?.reasoning_content === "string" ? delta.reasoning_content : "",
    finishReason: choice?.finish_reason,
    model: chunk.model,
  }
}

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
  private routeTimeoutMs: number

  private config: LLMProviderConfig

  constructor(config: LLMProviderConfig) {
    this.config = config
    this.name = config.name
    this.capability = config.capability
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel
    this.routeTimeoutMs = config.timeoutMs ?? Number(env.LLM_TIMEOUT_MS || 60000)
    const fetchOptions = config.proxyURL
      ? ({ dispatcher: getSharedProxyAgent(config.proxyURL) } as ClientOptions["fetchOptions"])
      : undefined
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      fetchOptions,
      timeout: this.routeTimeoutMs,
      maxRetries: config.maxRetries,
    })
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  /**
   * 模型名-供应商兼容预检（发请求前过滤，防止错配 400）：
   * - 聚合网关：认识一切模型名（含 vendor/model 跨网关格式）
   * - 直连供应商：跨网关格式（含 /）必不认识；自家名按 ownModelPrefixes 前缀判断；
   *   未声明前缀时不过滤（保持旧行为）
   */
  supportsModel(model: string): boolean {
    if (this.config.isGateway) return true
    if (model.includes("/")) return false
    const prefixes = this.config.ownModelPrefixes
    if (!prefixes || prefixes.length === 0) return true
    const lower = model.toLowerCase()
    return prefixes.some((prefix) => lower.startsWith(prefix))
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    // 开关打开且本轮有活跃 trace 时，改走内部流，才能把思考实时推到侧通道。
    // 开关关闭时逐字保持原 complete（非流式 JSON），含 usage / finishReason。
    if (isShowLiveThinkingEnabled() && getActiveAimTraceId()) {
      return this.completeFromLiveStream(options)
    }
    const model = options.model || this.defaultModel
    const timeout = resolveProviderTimeoutMs(this.routeTimeoutMs)

    const response = await this.client.chat.completions.create({
      model,
      messages: options.messages as ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat,
      stream: false,
    }, { timeout, signal: getAimExecutionDeadline()?.signal })

    const choice = response.choices[0]
    const content = extractAssistantText(choice?.message)
    if (!content) {
      throw new Error(`[${this.name}] Empty response from model ${model}`)
    }

    return {
      content,
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

  /** 成稿 complete 的实时思考路径：内部 stream，正文仍只累加 content。 */
  private async completeFromLiveStream(options: CompletionOptions): Promise<CompletionResult> {
    const model = options.model || this.defaultModel
    const timeout = resolveProviderTimeoutMs(this.routeTimeoutMs)
    const thinking = attachLiveThinking(getActiveAimTraceId())
    const response = await this.client.chat.completions.create({
      model,
      messages: options.messages as ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat,
      stream: true,
    }, { timeout, signal: getAimExecutionDeadline()?.signal })

    let content = ""
    let finishReason: string | null | undefined
    let responseModel = model
    try {
      for await (const chunk of response) {
        const delta = readAssistantDelta(chunk)
        thinking.onReasoning(delta.reasoning)
        if (delta.finishReason) finishReason = delta.finishReason
        if (delta.model) responseModel = delta.model
        if (delta.content) {
          thinking.onContentStart()
          content += delta.content
        }
      }
    } finally {
      thinking.finish(Boolean(content))
    }
    const trimmed = content.trim()
    if (!trimmed) {
      throw new Error(`[${this.name}] Empty response from model ${model}`)
    }
    return { content: trimmed, model: responseModel, provider: this.name, finishReason }
  }

  async *stream(options: CompletionOptions): AsyncIterable<string> {
    const model = options.model || this.defaultModel
    const timeout = resolveProviderTimeoutMs(this.routeTimeoutMs)

    const response = await this.client.chat.completions.create({
      model,
      messages: options.messages as ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat,
      stream: true,
    }, { timeout, signal: getAimExecutionDeadline()?.signal })

    // 正文通道只透传 content。思考走 trace 侧通道（开关 + 活跃 trace 才推）；
    // 整段流结束仍无正文时抛错，让模型路由切换到下一个 provider。
    const thinking = attachLiveThinking(getActiveAimTraceId())
    let contentEmitted = false
    try {
      for await (const chunk of response) {
        const delta = readAssistantDelta(chunk)
        thinking.onReasoning(delta.reasoning)
        if (delta.content) {
          thinking.onContentStart()
          contentEmitted = true
          yield delta.content
        }
      }
    } finally {
      thinking.finish(contentEmitted)
    }
    if (!contentEmitted) {
      throw new Error(`[${this.name}] Empty response from model ${model}`)
    }
  }
}

/**
 * 只认 content 作为助手正文；reasoning_content 属于内部思维链，
 * 任何情况下都不作为答案或客户可见内容返回（用户指令唯一真源整改约定）。
 * content 为空时返回空串，由调用方按「空响应」显式失败并走路由重试。
 */
export function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== "object") return ""
  const record = message as { content?: unknown; reasoning_content?: unknown }
  const content = typeof record.content === "string" ? record.content.trim() : ""
  return content
}

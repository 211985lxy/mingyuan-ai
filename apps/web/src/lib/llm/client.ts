import { getProviderConfigs } from "./config"
import { OpenAICompatibleProvider } from "./provider"
import type { CompletionOptions, CompletionResult, LLMProvider } from "./types"
import {
  classifyProviderError,
  reportLlmInvocation,
  reportProviderAttempt,
  type ProviderErrorKind,
} from "./telemetry"
import { env } from "@/env"
import { AimDeadlineExceededError } from "./execution-deadline"

let _instance: LLMClient | null = null

/** 指数退避：rate_limit / server 错误后短暂等待，避免连续打爆下一个 provider */
const BACKOFF_BASE_MS = 400
function backoffDelay(attemptIndex: number, errorKind: string): number {
  // 只对 rate_limit 和 server 类错误退避，网络/配置错误立即切换
  if (errorKind !== "rate_limit" && errorKind !== "server") return 0
  return BACKOFF_BASE_MS * Math.pow(2, attemptIndex) // 400ms, 800ms, 1600ms
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function resolveMaxTokens(requested: number | undefined, limit: number): number {
  if (requested === undefined) return limit
  const parsed = Number(requested)
  if (!Number.isFinite(parsed) || parsed <= 0) return limit
  return Math.min(Math.floor(parsed), limit)
}

function reportStreamFailure(
  provider: LLMProvider,
  options: CompletionOptions,
  error: Error,
  errorKind: ProviderErrorKind,
  startedAt: number,
  attemptIndex: number,
) {
  reportProviderAttempt({
    provider: provider.name,
    model: options.model ?? provider.defaultModel,
    capability: provider.capability,
    status: "failed",
    error: error.message,
    errorKind,
    durationMs: Date.now() - startedAt,
    attemptIndex,
  })
}

export class LLMClient {
  private providers: LLMProvider[]
  private maxAttempts?: number

  constructor(providers: LLMProvider[], options: { maxAttempts?: number } = {}) {
    this.providers = providers
    this.maxAttempts = options.maxAttempts
  }

  /** Get the singleton LLMClient, configured from environment variables. */
  static shared(): LLMClient {
    if (!_instance) {
      const configs = getProviderConfigs()
      const providers = configs
        .map((c) => new OpenAICompatibleProvider(c))
        .filter((p) => p.isAvailable())

      _instance = new LLMClient(providers)
    }
    return _instance
  }

  /** Reset singleton (useful for tests). */
  static reset(): void {
    _instance = null
  }


  /**
   * 被熔断、未配置、模型不兼容、同一供应商已请求过的候选不消耗尝试次数。
   */
  private shouldSkipWithoutConsuming(
    provider: LLMProvider,
    model: string | undefined,
    requestedVendors: Set<string>,
    requireStream = false,
  ): boolean {
    if (requireStream && !provider.stream) return true
    if (typeof provider.isAvailable === "function" && !provider.isAvailable()) return true
    if (requestedVendors.has(provider.name)) return true
    if (model && provider.supportsModel && !provider.supportsModel(model)) return true
    return false
  }

  /**
   * Run a chat completion through the provider chain.
   * Tries each provider in order; falls back on failure.
   *
   * aim-harness-v1: reports each provider attempt via telemetry and honors the
   * fallback policy — non-retryable errors (400/auth/config) fail immediately.
   * Provider balance/quota errors (402/403) are retryable so the route can continue.
   */
  async complete(options: CompletionOptions): Promise<CompletionResult> {
    if (this.providers.length === 0) {
      throw new Error(
        "[llm] No AI providers configured. Set THEROUTER_API_KEY or OPENAI_API_KEY."
      )
    }

    const maxAttempts = normalizeInteger(
      this.maxAttempts ?? env.LLM_MAX_PROVIDER_ATTEMPTS,
      3,
      1,
      5,
    )
    const maxOutputTokens = normalizeInteger(env.LLM_MAX_OUTPUT_TOKENS, 8192, 256, 16_384)
    const boundedOptions = {
      ...options,
      maxTokens: resolveMaxTokens(options.maxTokens, maxOutputTokens),
    }
    reportLlmInvocation(boundedOptions, false)
    let lastError: Error | undefined
    let actualRequests = 0
    const requestedVendors = new Set<string>()

    for (const provider of this.providers) {
      if (actualRequests >= maxAttempts) break
      if (this.shouldSkipWithoutConsuming(provider, boundedOptions.model, requestedVendors)) {
        continue
      }
      requestedVendors.add(provider.name)
      const attemptIndex = actualRequests
      actualRequests += 1
      const startedAt = Date.now()
      try {
        const result = await provider.complete(boundedOptions)
        reportProviderAttempt({
          provider: provider.name,
          model: boundedOptions.model ?? provider.defaultModel,
          capability: provider.capability,
          status: "success",
          durationMs: Date.now() - startedAt,
          attemptIndex,
          responseModel: result.model,
          totalTokens: result.usage?.totalTokens,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
        })
        return result
      } catch (error) {
        if (error instanceof AimDeadlineExceededError) throw error
        lastError = error instanceof Error ? error : new Error(String(error))
        const classified = classifyProviderError(error)
        reportStreamFailure(provider, boundedOptions, lastError, classified.kind, startedAt, attemptIndex)
        console.warn(
          `[llm] Provider "${provider.name}" failed (${classified.kind}), trying next:`,
          lastError.message
        )
        if (
          classified.kind === "client"
          && /model|unsupported/i.test(lastError.message)
        ) {
          console.error(
            `[llm-config] 疑似模型名-供应商错配：provider=${provider.name} model=${boundedOptions.model ?? provider.defaultModel}。` +
              "该模型名应只发给认识它的聚合网关（见 createGatewayLLM / AGENT_ROUTES）。",
          )
        }
        if (!classified.retryable) break
        const delay = backoffDelay(attemptIndex, classified.kind)
        if (delay > 0) await sleep(delay)
      }
    }

    if (
      !lastError
      && boundedOptions.model
      && this.providers.every(
        (p) => p.supportsModel && !p.supportsModel(boundedOptions.model as string),
      )
    ) {
      throw new Error(
        `[llm-config] 模型名 "${boundedOptions.model}" 不被任何已配置供应商认识（${this.providers.map((p) => p.name).join(", ")}）。` +
          "请检查模型名拼写或改走聚合网关（createGatewayLLM）。",
      )
    }
    throw lastError ?? new Error("[llm] All providers failed")
  }

  /**
   * Stream a chat completion through the provider chain.
   * Falls back only if a provider fails before emitting chunks.
   *
   * aim-harness-v1: reports attempts + honors fallback policy (non-retryable
   * errors fail immediately). Telemetry reports the successful provider once the
   * stream completes; failures-before-emit are classified like complete().
   */
  async *stream(options: CompletionOptions): AsyncIterable<string> {
    if (this.providers.length === 0) {
      throw new Error(
        "[llm] No AI providers configured. Set THEROUTER_API_KEY or OPENAI_API_KEY."
      )
    }

    const maxAttempts = normalizeInteger(
      this.maxAttempts ?? env.LLM_MAX_PROVIDER_ATTEMPTS,
      3,
      1,
      5,
    )
    const maxOutputTokens = normalizeInteger(env.LLM_MAX_OUTPUT_TOKENS, 8192, 256, 16_384)
    const boundedOptions = {
      ...options,
      maxTokens: resolveMaxTokens(options.maxTokens, maxOutputTokens),
    }
    reportLlmInvocation(boundedOptions, true)
    let lastError: Error | undefined
    let actualRequests = 0
    const requestedVendors = new Set<string>()

    for (const provider of this.providers) {
      if (actualRequests >= maxAttempts) break
      if (this.shouldSkipWithoutConsuming(provider, boundedOptions.model, requestedVendors, true)) {
        continue
      }

      requestedVendors.add(provider.name)
      const attemptIndex = actualRequests
      actualRequests += 1
      const startedAt = Date.now()
      let emitted = false
      try {
        for await (const chunk of provider.stream!(boundedOptions)) {
          emitted = true
          yield chunk
        }
        if (!emitted) {
          throw new Error(
            `[${provider.name}] Empty stream from model ${boundedOptions.model ?? provider.defaultModel}`,
          )
        }
        reportProviderAttempt({
          provider: provider.name,
          model: boundedOptions.model ?? provider.defaultModel,
          capability: provider.capability,
          status: "success",
          durationMs: Date.now() - startedAt,
          attemptIndex,
        })
        return
      } catch (error) {
        if (error instanceof AimDeadlineExceededError) throw error
        lastError = error instanceof Error ? error : new Error(String(error))
        const classified = classifyProviderError(error)
        reportStreamFailure(provider, boundedOptions, lastError, classified.kind, startedAt, attemptIndex)
        if (emitted) throw lastError
        console.warn(
          `[llm] Provider "${provider.name}" stream failed (${classified.kind}), trying next:`,
          lastError.message
        )
        if (!classified.retryable) break
        const delay = backoffDelay(attemptIndex, classified.kind)
        if (delay > 0) await sleep(delay)
      }
    }

    if (
      !lastError
      && boundedOptions.model
      && this.providers.every(
        (p) => p.supportsModel && !p.supportsModel(boundedOptions.model as string),
      )
    ) {
      throw new Error(
        `[llm-config] 模型名 "${boundedOptions.model}" 不被任何已配置供应商认识（${this.providers.map((p) => p.name).join(", ")}）。` +
          "请检查模型名拼写或改走聚合网关（createGatewayLLM）。",
      )
    }
    throw lastError ?? new Error("[llm] No streaming providers available")
  }

  /** Check if at least one provider is available. */
  get available(): boolean {
    return this.providers.length > 0
  }

  /** List configured provider names. */
  get providerNames(): string[] {
    return this.providers.map((p) => p.name)
  }
}

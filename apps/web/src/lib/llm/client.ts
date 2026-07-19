import { getProviderConfigs } from "./config"
import { OpenAICompatibleProvider } from "./provider"
import type { CompletionOptions, CompletionResult, LLMProvider } from "./types"
import {
  classifyProviderError,
  reportLlmInvocation,
  reportProviderAttempt,
} from "./telemetry"
import { env } from "@/env"

let _instance: LLMClient | null = null

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
      2,
      1,
      3,
    )
    const maxOutputTokens = normalizeInteger(env.LLM_MAX_OUTPUT_TOKENS, 8192, 256, 16_384)
    const boundedOptions = {
      ...options,
      maxTokens: resolveMaxTokens(options.maxTokens, maxOutputTokens),
    }
    reportLlmInvocation(boundedOptions, false)
    let lastError: Error | undefined

    for (let index = 0; index < Math.min(this.providers.length, maxAttempts); index += 1) {
      const provider = this.providers[index]
      const startedAt = Date.now()
      try {
        const result = await provider.complete(boundedOptions)
        reportProviderAttempt({
          provider: provider.name,
          model: boundedOptions.model ?? provider.defaultModel,
          capability: provider.capability,
          status: "success",
          durationMs: Date.now() - startedAt,
          attemptIndex: index,
          responseModel: result.model,
          totalTokens: result.usage?.totalTokens,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
        })
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const classified = classifyProviderError(error)
        reportProviderAttempt({
          provider: provider.name,
          model: boundedOptions.model ?? provider.defaultModel,
          capability: provider.capability,
          status: "failed",
          error: lastError.message,
          errorKind: classified.kind,
          durationMs: Date.now() - startedAt,
          attemptIndex: index,
        })
        console.warn(
          `[llm] Provider "${provider.name}" failed (${classified.kind}), trying next:`,
          lastError.message
        )
        // Non-retryable errors must not silently switch models.
        if (!classified.retryable) break
      }
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
      2,
      1,
      3,
    )
    const maxOutputTokens = normalizeInteger(env.LLM_MAX_OUTPUT_TOKENS, 8192, 256, 16_384)
    const boundedOptions = {
      ...options,
      maxTokens: resolveMaxTokens(options.maxTokens, maxOutputTokens),
    }
    reportLlmInvocation(boundedOptions, true)
    let lastError: Error | undefined

    for (let index = 0; index < Math.min(this.providers.length, maxAttempts); index += 1) {
      const provider = this.providers[index]
      if (!provider.stream) continue

      const startedAt = Date.now()
      let emitted = false
      try {
        for await (const chunk of provider.stream(boundedOptions)) {
          emitted = true
          yield chunk
        }
        reportProviderAttempt({
          provider: provider.name,
          model: boundedOptions.model ?? provider.defaultModel,
          capability: provider.capability,
          status: "success",
          durationMs: Date.now() - startedAt,
          attemptIndex: index,
        })
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (emitted) {
          reportProviderAttempt({
            provider: provider.name,
            model: boundedOptions.model ?? provider.defaultModel,
            capability: provider.capability,
            status: "failed",
            error: lastError.message,
            errorKind: classifyProviderError(error).kind,
            durationMs: Date.now() - startedAt,
            attemptIndex: index,
          })
          throw lastError
        }
        const classified = classifyProviderError(error)
        reportProviderAttempt({
          provider: provider.name,
          model: boundedOptions.model ?? provider.defaultModel,
          capability: provider.capability,
          status: "failed",
          error: lastError.message,
          errorKind: classified.kind,
          durationMs: Date.now() - startedAt,
          attemptIndex: index,
        })
        console.warn(
          `[llm] Provider "${provider.name}" stream failed (${classified.kind}), trying next:`,
          lastError.message
        )
        if (!classified.retryable) break
      }
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

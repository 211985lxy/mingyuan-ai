import { getProviderConfigs } from "./config"
import { OpenAICompatibleProvider } from "./provider"
import type { CompletionOptions, CompletionResult, LLMProvider } from "./types"
import {
  classifyProviderError,
  reportLlmInvocation,
  reportProviderAttempt,
} from "./telemetry"

let _instance: LLMClient | null = null

export class LLMClient {
  private providers: LLMProvider[]

  constructor(providers: LLMProvider[]) {
    this.providers = providers
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
   * fallback policy — non-retryable errors (400/401/403/config) fail immediately
   * instead of silently switching to the next provider.
   */
  async complete(options: CompletionOptions): Promise<CompletionResult> {
    if (this.providers.length === 0) {
      throw new Error(
        "[llm] No AI providers configured. Set THEROUTER_API_KEY or OPENAI_API_KEY."
      )
    }

    reportLlmInvocation(options, false)
    let lastError: Error | undefined

    for (let index = 0; index < this.providers.length; index += 1) {
      const provider = this.providers[index]
      const startedAt = Date.now()
      try {
        const result = await provider.complete(options)
        reportProviderAttempt({
          provider: provider.name,
          model: options.model ?? provider.defaultModel,
          status: "success",
          durationMs: Date.now() - startedAt,
          attemptIndex: index,
          responseModel: result.model,
          totalTokens: result.usage?.totalTokens,
        })
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const classified = classifyProviderError(error)
        reportProviderAttempt({
          provider: provider.name,
          model: options.model ?? provider.defaultModel,
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

    reportLlmInvocation(options, true)
    let lastError: Error | undefined

    for (let index = 0; index < this.providers.length; index += 1) {
      const provider = this.providers[index]
      if (!provider.stream) continue

      const startedAt = Date.now()
      let emitted = false
      try {
        for await (const chunk of provider.stream(options)) {
          emitted = true
          yield chunk
        }
        reportProviderAttempt({
          provider: provider.name,
          model: options.model ?? provider.defaultModel,
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
            model: options.model ?? provider.defaultModel,
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
          model: options.model ?? provider.defaultModel,
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

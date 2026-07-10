/**
 * LLM provider-attempt telemetry.
 *
 * The existing LLMClient silently swallows per-provider failures and falls
 * back. The aim-harness-v1 needs to observe every attempt (provider/model,
 * success or failure, error kind, latency) so it can record `degraded`,
 * `fallbackIndex` and the full provider-attempt chain in the trace + snapshot.
 *
 * This module is the single, opt-in seam. LLMClient invokes the active
 * callback (if any) after each provider attempt. Nothing observes by default,
 * so production behavior is unchanged when no run is in flight.
 *
 * The harness also enforces the fallback policy here: non-retryable errors
 * (400/401/403, config errors) must fail immediately instead of silently
 * switching models. LLMClient checks `shouldRetryAfter` before continuing to
 * the next provider.
 */

export type ProviderAttemptStatus = "success" | "failed"

export interface ProviderAttempt {
  provider: string
  model?: string
  status: ProviderAttemptStatus
  /** human-readable error message on failure */
  error?: string
  /** classified error kind: network | timeout | rate_limit | client | server | config | unknown */
  errorKind?: ProviderErrorKind
  durationMs?: number
  attemptIndex: number
  /** response model as reported by the provider (may differ from requested) */
  responseModel?: string
  totalTokens?: number
}

export type ProviderErrorKind =
  | "network"
  | "timeout"
  | "rate_limit"
  | "client" // 400 bad request, invalid messages, unsupported model
  | "server" // 5xx
  | "config" // missing key / baseURL misconfiguration
  | "auth" // 401/403
  | "unknown"

/** A callback registered for the duration of one AIM run. */
export type LlmTelemetryCallback = (attempt: ProviderAttempt) => void

let _activeCallback: LlmTelemetryCallback | null = null

/** Register the run-scoped telemetry callback. Returns a disposer. */
export function setLlmTelemetryCallback(cb: LlmTelemetryCallback | null): () => void {
  _activeCallback = cb
  return () => {
    if (_activeCallback === cb) _activeCallback = null
  }
}

/** Internal: report an attempt if a callback is active. */
export function reportProviderAttempt(attempt: ProviderAttempt): void {
  if (_activeCallback) {
    try {
      _activeCallback(attempt)
    } catch {
      // Telemetry must never break the generation path.
    }
  }
}

/**
 * Classify a provider error and decide whether fallback is allowed.
 *
 * Per the harness policy, only transient failures may fall back:
 *   - network errors, timeouts, 429 (rate_limit), 5xx (server)  → retryable
 *   - 400 (client/invalid request), 401/403 (auth), config errors → NOT retryable
 */
export function classifyProviderError(error: unknown): {
  kind: ProviderErrorKind
  retryable: boolean
} {
  const message = error instanceof Error ? error.message : String(error)

  // OpenAI SDK surfaces HTTP status in error objects/messages.
  const statusMatch = message.match(/\b(40[013]|429|5\d{2})\b/)
  const status = statusMatch ? Number(statusMatch[1]) : NaN

  if (!Number.isNaN(status)) {
    if (status === 429) return { kind: "rate_limit", retryable: true }
    if (status >= 500) return { kind: "server", retryable: true }
    if (status === 401 || status === 403) return { kind: "auth", retryable: false }
    if (status === 400) return { kind: "client", retryable: false }
  }

  const lower = message.toLowerCase()
  if (/(timeout|timed out|deadline|aborted)/.test(lower)) {
    return { kind: "timeout", retryable: true }
  }
  if (/(no providers configured|missing.*key|api[_ ]?key|baseurl|config)/.test(lower)) {
    return { kind: "config", retryable: false }
  }
  if (/(econnrefused|enotfound|epipe|fetch failed|network|socket|getaddrinfo)/.test(lower)) {
    return { kind: "network", retryable: true }
  }

  return { kind: "unknown", retryable: true }
}

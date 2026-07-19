export function classifyDispatchRetry(error: string) {
  const lower = error.toLowerCase()
  const status = Number(error.match(/\b(4\d{2}|5\d{2})\b/)?.[1] ?? NaN)
  const timedOut = status === 408 || /(timeout|timed out|deadline|aborted|超时)/.test(lower)
  const retryable = timedOut
    || status === 429
    || status >= 500
    || /(econnrefused|econnreset|enotfound|epipe|fetch failed|network|socket|getaddrinfo|网络)/.test(lower)
  return { retryable, stopReason: timedOut ? "execution_timeout" as const : "human_required" as const }
}

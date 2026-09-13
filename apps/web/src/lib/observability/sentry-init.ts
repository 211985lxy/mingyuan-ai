/**
 * Sentry 初始化共用项。DSN 未配时 enabled=false，本地和 CI 都不发事件。
 */
export function buildSentryInitOptions(input: { client?: boolean } = {}) {
  const dsn = input.client
    ? process.env.NEXT_PUBLIC_SENTRY_DSN
    : process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  return {
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE,
  }
}

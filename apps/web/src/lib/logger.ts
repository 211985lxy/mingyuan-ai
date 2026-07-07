import pino from "pino"

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level(label) {
      return { level: label }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: "mingyuan-web",
    env: process.env.NODE_ENV || "development",
  },
})

/**
 * Create a child logger with request context.
 * Use in API routes to correlate all log entries for a single request.
 */
export function createRequestLogger(context: {
  requestId: string
  userId?: string
  path?: string
}) {
  return logger.child(context)
}

/**
 * Generate a short unique request ID for log correlation.
 */
export function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

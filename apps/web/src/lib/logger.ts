import { env } from "@/env"
import pino from "pino"
import { createHash, randomUUID } from "node:crypto"

export const logger = pino({
  level: env.LOG_LEVEL || "info",
  formatters: {
    level(label) {
      return { level: label }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: "mingyuan-web",
    env: env.NODE_ENV || "development",
  },
})

/**
 * Create a child logger with request context.
 * Use in API routes to correlate all log entries for a single request.
 */
export function createRequestLogger(context: {
  requestId: string
  userIdHash?: string
  path?: string
}) {
  return logger.child(context)
}

export function hashLogIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}

/**
 * Generate a short unique request ID for log correlation.
 */
export function generateRequestId(): string {
  return randomUUID()
}

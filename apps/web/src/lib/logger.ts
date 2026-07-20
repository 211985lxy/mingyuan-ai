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
/**
 * @description 创建requestlogger
 * @param context - 上下文
 * @returns 无返回值
 */
export function createRequestLogger(context: {
  requestId: string
  userIdHash?: string
  path?: string
}) {
  return logger.child(context)
}

/**
 * @description 将敏感标识符进行 SHA-256 哈希截断，用于日志中脱敏记录用户身份
 * @param value - 需要哈希的原始标识符字符串
 * @returns 16 位十六进制哈希字符串
 */
export function hashLogIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}

/**
 * Generate a short unique request ID for log correlation.
 */
/**
 * @description 生成requestid
 * @returns string
 */
export function generateRequestId(): string {
  return randomUUID()
}

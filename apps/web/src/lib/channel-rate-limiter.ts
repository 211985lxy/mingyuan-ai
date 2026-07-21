/**
 * Channel-level rate limiter for inspiration ingestion.
 *
 * Uses Redis sorted-set sliding window (same pattern as auth-rate-limit but
 * with per-channel keys). Falls back to allowing all when Redis is unavailable.
 */

import { redis } from "@/lib/redis"
import { env } from "@/env"

/** Lua script: sorted-set sliding window rate limiter. */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local windowStart = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, now .. ':' .. math.random())
  redis.call('PEXPIRE', key, window + 1000)
  return 0
end
return 1
`

const DEFAULT_LIMIT = 10 // max messages per channel per window
const DEFAULT_WINDOW_MS = 60_000 // 1 minute window

export interface RateLimitResult {
  allowed: boolean
  /** Suggested retry delay in milliseconds (only set when rate limited). */
  retryAfterMs: number
}

/**
 * Check whether a channel is within its rate limit for sending inspiration messages.
 *
 * @param input.platform - The platform identifier (e.g., "feishu", "wecom")
 * @param input.externalChatId - The channel/group ID
 * @param input.externalAccountId - Optional account disambiguator
 * @param input.limit - Max messages per window (default: 10)
 * @param input.windowMs - Window size in milliseconds (default: 60_000)
 */
/**
 * @description 允许channelmessage
 * @param input - 输入数据
 * @returns Promise<RateLimitResult>
 */
export async function allowChannelMessage(input: {
  platform: string
  externalChatId: string
  externalAccountId?: string
  limit?: number
  windowMs?: number
}): Promise<RateLimitResult> {
  // Redis unavailable → allow (graceful degradation)
  if (!env.REDIS_URL) return { allowed: true, retryAfterMs: 0 }

  const limit = input.limit ?? DEFAULT_LIMIT
  const windowMs = input.windowMs ?? DEFAULT_WINDOW_MS
  const key = `channel-rate:${input.platform}:${input.externalAccountId || "default"}:${input.externalChatId}`
  const now = Date.now()

  try {
    const blocked = Number(
      await Promise.race([
        redis.eval(SLIDING_WINDOW_SCRIPT, 1, key, String(windowMs), String(limit), String(now)),
        // Timeout after 2s — degrade to allow if Redis is slow
        new Promise((_, reject) => setTimeout(() => reject(new Error("RATE_LIMIT_REDIS_TIMEOUT")), 2000)),
      ]),
    )
    return blocked === 1
      ? { allowed: false, retryAfterMs: windowMs }
      : { allowed: true, retryAfterMs: 0 }
  } catch {
    // Redis error or timeout → allow (graceful degradation, consistent with auth-rate-limit)
    return { allowed: true, retryAfterMs: 0 }
  }
}

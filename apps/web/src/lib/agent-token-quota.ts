/**
 * Token / request quota enforcement for remote agent invocations.
 *
 * Two budgets per key:
 * - minuteLimit: sliding-window request count (Redis sorted set, same pattern
 *   as channel-rate-limiter). Gracefully allows when Redis is unavailable.
 * - dailyTokenLimit: sum of output+input tokens across today's invocations.
 *   Enforced at submit time against already-spent tokens; null = unlimited.
 */

import { redis } from "@/lib/redis"
import { prisma } from "@/lib/prisma"
import { REMOTE_ERROR_CODE } from "@/lib/aim-remote/contracts"

const QUOTA_KEY_PREFIX = "aim:quota:minute"

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

const WINDOW_MS = 60_000

export interface QuotaResult {
  allowed: boolean
  errorCode?: typeof REMOTE_ERROR_CODE[keyof typeof REMOTE_ERROR_CODE]
}

/** Check the per-minute sliding-window request limit. Degrades to allow on Redis failure. */
export async function checkMinuteQuota(apiKeyId: string, minuteLimit: number): Promise<QuotaResult> {
  try {
    const blocked = Number(
      await Promise.race([
        redis.eval(SLIDING_WINDOW_SCRIPT, 1, `${QUOTA_KEY_PREFIX}:${apiKeyId}`, String(WINDOW_MS), String(minuteLimit), String(Date.now())),
        new Promise((_, reject) => setTimeout(() => reject(new Error("QUOTA_REDIS_TIMEOUT")), 2000)),
      ]),
    )
    return blocked === 1 ? { allowed: false, errorCode: REMOTE_ERROR_CODE.MINUTE_LIMIT_EXCEEDED } : { allowed: true }
  } catch {
    // Redis unavailable → allow (graceful degradation)
    return { allowed: true }
  }
}

/**
 * Sum tokens spent by a key today (inputTokens + outputTokens of succeeded
 * invocations). Returns null when there is no dailyTokenLimit to check.
 */
export async function getTokensSpentToday(apiKeyId: string): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const result = await prisma.agentInvocation.aggregate({
    where: { apiKeyId, queuedAt: { gte: today } },
    _sum: { inputTokens: true, outputTokens: true },
  })
  const input = result._sum.inputTokens ?? 0
  const output = result._sum.outputTokens ?? 0
  return input + output
}

/**
 * Enforce the daily token budget at submit time. Throws REMOTE_ERROR_CODE
 * (caller maps to 429) if the key has already exhausted its budget.
 * No-op when dailyTokenLimit is null (unlimited).
 */
export async function assertDailyTokenBudget(apiKeyId: string, dailyTokenLimit: number | null): Promise<void> {
  if (dailyTokenLimit == null) return
  const spent = await getTokensSpentToday(apiKeyId)
  if (spent >= dailyTokenLimit) {
    const err = new Error(REMOTE_ERROR_CODE.DAILY_TOKEN_EXCEEDED)
    err.name = "RemoteQuotaError"
    throw err
  }
}

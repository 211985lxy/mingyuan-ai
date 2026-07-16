import { createHash } from "node:crypto"
import { env } from "@/env"
import { redis } from "@/lib/redis"
import type { NextRequest } from "next/server"

type RateLimitRule = { limit: number; windowSeconds: number }
type MemoryCounter = { count: number; expiresAt: number }

const memoryCounters = new Map<string, MemoryCounter>()
const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`

function requestIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

function buildKey(scope: string, request: NextRequest, identity: string): string {
  const digest = createHash("sha256")
    .update(`${requestIp(request)}:${identity.trim().toLowerCase()}`)
    .digest("hex")
  return `auth-rate:${scope}:${digest}`
}

function checkMemory(key: string, rule: RateLimitRule): boolean {
  const now = Date.now()
  if (memoryCounters.size > 10_000) {
    for (const [counterKey, counter] of memoryCounters) {
      if (counter.expiresAt <= now) memoryCounters.delete(counterKey)
    }
  }
  const current = memoryCounters.get(key)
  if (!current || current.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + rule.windowSeconds * 1000 })
    return true
  }
  current.count += 1
  return current.count <= rule.limit
}

export async function allowAuthAttempt(
  scope: string,
  request: NextRequest,
  identity: string,
  rule: RateLimitRule,
): Promise<boolean> {
  const key = buildKey(scope, request, identity)
  if (!env.REDIS_URL) return checkMemory(key, rule)

  try {
    const count = Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(rule.windowSeconds)))
    return Number.isFinite(count) && count <= rule.limit
  } catch {
    return checkMemory(key, rule)
  }
}

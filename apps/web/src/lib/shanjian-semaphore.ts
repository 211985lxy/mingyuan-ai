import { redis } from "./redis"
import { prisma } from "./prisma"

const SEMAPHORE_KEY = "shanjian:inflight"
const MAX_CONCURRENT = parseInt(process.env.SHANJIAN_MAX_CONCURRENT ?? "8", 10)

// Lua script: atomic acquire
// Returns 1 if acquired, 0 if at capacity
const ACQUIRE_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  if current < tonumber(ARGV[1]) then
    redis.call('INCR', KEYS[1])
    return 1
  end
  return 0
`

// Lua script: atomic release
// DECR but not below 0
const RELEASE_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  if current > 0 then
    redis.call('DECR', KEYS[1])
    return current - 1
  end
  return 0
`

export async function acquireSlot(): Promise<boolean> {
  try {
    const result = await redis.eval(ACQUIRE_SCRIPT, 1, SEMAPHORE_KEY, String(MAX_CONCURRENT))
    return result === 1
  } catch {
    // Redis unavailable → fallback to DB count
    return acquireSlotFallback()
  }
}

export async function releaseSlot(): Promise<void> {
  try {
    await redis.eval(RELEASE_SCRIPT, 1, SEMAPHORE_KEY)
  } catch {
    // ignore; calibration will correct
  }
}

export async function getSlotUsage(): Promise<number> {
  try {
    const val = await redis.get(SEMAPHORE_KEY)
    return Math.max(0, parseInt(val ?? "0", 10))
  } catch {
    return 0
  }
}

/** Redis unavailable: fall back to DB in-flight count (don't blindly allow) */
async function acquireSlotFallback(): Promise<boolean> {
  console.warn("[semaphore] Redis unavailable, falling back to DB count")
  const inFlight = await countInFlightFromDB()
  return inFlight < MAX_CONCURRENT
}

/** Count tasks truly occupying Shanjian slots (pending + processing + avatar cloning + voice processing) */
export async function countInFlightFromDB(): Promise<number> {
  const [videos, avatars, voices] = await prisma.$transaction([
    prisma.videoTask.count({ where: { status: { in: ["pending", "processing"] } } }),
    prisma.avatar.count({ where: { status: "cloning" } }),
    prisma.asset.count({ where: { assetType: "voice", status: "processing" } }),
  ])
  return videos + avatars + voices
}

/**
 * Calibrate: overwrite Redis semaphore with the actual DB in-flight count.
 * Called each recovery pass to self-correct drift.
 */
export async function calibrateSemaphore(): Promise<void> {
  try {
    const actual = await countInFlightFromDB()
    const current = await getSlotUsage()
    if (actual !== current) {
      console.warn(`[semaphore] Calibrating: redis=${current} → actual=${actual}`)
      await redis.set(SEMAPHORE_KEY, String(actual))
    }
  } catch (error) {
    console.error("[semaphore] Calibration failed:", error)
  }
}

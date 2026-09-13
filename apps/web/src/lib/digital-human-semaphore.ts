import { env } from "@/env"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"

export type DigitalHumanProvider = "chanjing" | "shanjian"

const ACQUIRE_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  if current < tonumber(ARGV[1]) then
    redis.call('INCR', KEYS[1])
    return 1
  end
  return 0
`

const RELEASE_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  if current > 0 then
    redis.call('DECR', KEYS[1])
    return current - 1
  end
  return 0
`

export function providerSemaphoreKey(provider: DigitalHumanProvider): string {
  return `digital-human:${provider}:inflight`
}

export function providerMaxConcurrent(provider: DigitalHumanProvider): number {
  const configured = provider === "chanjing"
    ? env.CHANJING_MAX_CONCURRENT
    : env.SHANJIAN_MAX_CONCURRENT
  const parsed = Number.parseInt(configured ?? "1", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export async function acquireProviderSlot(provider: DigitalHumanProvider): Promise<boolean> {
  const key = providerSemaphoreKey(provider)
  try {
    const result = await redis.eval(ACQUIRE_SCRIPT, 1, key, String(providerMaxConcurrent(provider)))
    return result === 1
  } catch {
    console.warn(`[semaphore:${provider}] Redis unavailable, falling back to DB count`)
    return (await countProviderInFlight(provider)) < providerMaxConcurrent(provider)
  }
}

export async function releaseProviderSlot(provider: DigitalHumanProvider): Promise<void> {
  try {
    await redis.eval(RELEASE_SCRIPT, 1, providerSemaphoreKey(provider))
  } catch {
    // The next recovery calibration corrects Redis drift.
  }
}

export async function getProviderSlotUsage(provider: DigitalHumanProvider): Promise<number> {
  try {
    const value = await redis.get(providerSemaphoreKey(provider))
    return Math.max(0, Number.parseInt(value ?? "0", 10))
  } catch {
    return 0
  }
}

export async function countProviderInFlight(provider: DigitalHumanProvider): Promise<number> {
  const [videos, avatars] = await prisma.$transaction([
    prisma.videoTask.count({
      where: { provider, status: { in: ["pending", "processing"] } },
    }),
    prisma.avatar.count({
      where: { provider, status: "cloning" },
    }),
  ])

  if (provider === "shanjian") {
    const voices = await prisma.asset.count({
      where: { assetType: "voice", status: "processing" },
    })
    return videos + avatars + voices
  }
  return videos + avatars
}

export async function calibrateProviderSemaphore(provider: DigitalHumanProvider): Promise<void> {
  try {
    const actual = await countProviderInFlight(provider)
    const current = await getProviderSlotUsage(provider)
    if (actual !== current) {
      console.warn(`[semaphore:${provider}] Calibrating: redis=${current} → actual=${actual}`)
      await redis.set(providerSemaphoreKey(provider), String(actual))
    }
  } catch (error) {
    console.error(`[semaphore:${provider}] Calibration failed`, error)
  }
}

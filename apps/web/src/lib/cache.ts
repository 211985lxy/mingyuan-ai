import { redis } from "./redis"

/**
 * Generic Redis cache wrapper.
 * Tries cache first, falls back to fetcher on miss, stores result.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached) as T
  } catch {
    // Redis unavailable, fall through
  }

  const data = await fetcher()

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data))
  } catch {
    // Redis write failed, data still returned
  }

  return data
}

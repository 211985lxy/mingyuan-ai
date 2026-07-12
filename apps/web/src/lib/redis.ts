import { env } from "@/env"
import Redis from "ioredis"

const globalForRedis = globalThis as unknown as { redis: Redis }

function createRedisClient(): Redis {
  const client = new Redis(env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 5,
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: 10000,
    retryStrategy(times) {
      return Math.min(times * 200, 3000)
    },
    reconnectOnError(err) {
      return err.message.includes("READONLY")
    },
  })
  // 仅在首次创建实例时注册一次 error listener。
  // dev 热重载会重新求值本模块，若 on("error") 写在顶层会重复注册到同一个缓存实例，触发 MaxListenersExceededWarning。
  client.on("error", () => {
    // Redis is an optional cache layer for most app flows. Callers fall back to
    // direct fetches, so avoid noisy unhandled error logs during builds/dev.
  })
  return client
}

export const redis = globalForRedis.redis ?? createRedisClient()

if (env.NODE_ENV !== "production") globalForRedis.redis = redis

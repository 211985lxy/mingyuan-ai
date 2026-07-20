import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import type { ApiHotTopicFit, ApiHotTopicInsight } from "@/types/api"
import { parseFit, parseInsight } from "./formatting"
import { HotTopicIntelligenceError, INSIGHT_FAILURE_COOLDOWN_MS, SINGLE_FLIGHT_LOCK_TTL_SECONDS, SINGLE_FLIGHT_POLL_MS, SINGLE_FLIGHT_WAIT_MS, type TopicRow } from "./types"

/**
 * @description 构建insightlockkey
 * @param topic - 主题
 * @returns string
 */
export function buildInsightLockKey(topic: TopicRow): string {
  return `lock:hot-topic:insight:${topic.batchId}:${topic.sentenceId}`
}

/**
 * @description 构建fitlockkey
 * @param cacheKey - 缓存键
 * @returns string
 */
export function buildFitLockKey(cacheKey: string): string {
  return `lock:hot-topic:fit:${cacheKey}`
}

/**
 * @description acquiresingleflightlock
 * @param lockKey - lock键
 * @returns Promise<boolean>
 */
export async function acquireSingleFlightLock(lockKey: string): Promise<boolean> {
  try {
    const set = await redis.set(
      lockKey,
      "1",
      "EX",
      SINGLE_FLIGHT_LOCK_TTL_SECONDS,
      "NX",
    )
    return !!set
  } catch {
    return true
  }
}

/**
 * @description releasesingleflightlock
 * @param lockKey - lock键
 * @returns Promise<void>
 */
export async function releaseSingleFlightLock(lockKey: string): Promise<void> {
  try {
    await redis.del(lockKey)
  } catch {
    // Redis unavailable, ignore.
  }
}

/**
 * @description 等待forinsightcache
 * @param topicRowId - 主题行唯一标识符
 * @returns Promise<ApiHotTopicInsight | null>
 */
export async function waitForInsightCache(topicRowId: string): Promise<ApiHotTopicInsight | null> {
  const deadline = Date.now() + SINGLE_FLIGHT_WAIT_MS

  while (Date.now() < deadline) {
    await sleep(SINGLE_FLIGHT_POLL_MS)

    const topic = await prisma.douyinHotItem.findUnique({
      where: { id: topicRowId },
      select: {
        insightStatus: true,
        insightJson: true,
        insightError: true,
        insightUpdatedAt: true,
      },
    })

    const cached = parseInsight(topic?.insightJson)
    if (topic?.insightStatus === "ready" && cached) {
      return cached
    }

    if (
      topic?.insightStatus === "failed"
      && topic.insightUpdatedAt
      && Date.now() - topic.insightUpdatedAt.getTime() < INSIGHT_FAILURE_COOLDOWN_MS
    ) {
      throw new HotTopicIntelligenceError(
        "HOT_TOPIC_INSIGHT_RECENTLY_FAILED",
        topic.insightError || "热点洞察生成失败，请稍后再试",
        503,
      )
    }
  }

  return null
}

/**
 * @description 等待forfitcache
 * @param cacheKey - 缓存键
 * @returns Promise<ApiHotTopicFit | null>
 */
export async function waitForFitCache(cacheKey: string): Promise<ApiHotTopicFit | null> {
  const deadline = Date.now() + SINGLE_FLIGHT_WAIT_MS

  while (Date.now() < deadline) {
    await sleep(SINGLE_FLIGHT_POLL_MS)

    const cachedFit = await prisma.hotTopicFitCache.findUnique({
      where: { cacheKey },
      select: { fitJson: true },
    })
    const parsed = parseFit(cachedFit?.fitJson)
    if (parsed) {
      return parsed
    }
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

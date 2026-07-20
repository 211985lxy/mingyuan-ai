/**
 * Channel metrics recording and retrieval.
 *
 * Uses lightweight Redis INCR counters for real-time metrics.
 * Falls back to no-op when Redis is unavailable.
 *
 * Metric key format: `aim:metrics:{metricName}:{platform}:{timeBucket}`
 * Time bucket: YYYYMMDD (daily) for counters, YYYYMMDDHH for hourly histograms.
 */

import { redis } from "@/lib/redis"

const KEY_PREFIX = "aim:metrics"

type MetricName =
  | "received"
  | "duplicate"
  | "rate_limited"
  | "ingress_rejected"
  | "pipeline_started"
  | "pipeline_completed"
  | "pipeline_failed"
  | "reply_sent"
  | "reply_dead_letter"

/**
 * Increment a channel metric counter.
 * Gracefully degrades when Redis is unavailable.
 */
/**
 * @description recordchannelmetric
 * @param input - 输入数据
 * @returns Promise<void>
 */
export async function recordChannelMetric(input: {
  metric: MetricName
  platform: string
  externalAccountId?: string
  externalChatId?: string
  timestamp?: Date
}): Promise<void> {
  try {
    const ts = input.timestamp ?? new Date()
    const date = ts.toISOString().slice(0, 10) // YYYY-MM-DD
    const parts = [KEY_PREFIX, input.metric, input.platform, date]
    if (input.externalChatId) parts.push(input.externalChatId)

    const pipeline = redis.pipeline()
    // Global per-platform counter
    pipeline.incr([KEY_PREFIX, input.metric, input.platform, date].join(":"))
    // Per-channel counter (if chat ID provided)
    if (input.externalChatId) {
      pipeline.incr(parts.join(":"))
    }
    await pipeline.exec()
  } catch {
    // Redis unavailable — metrics are optional, don't throw
  }
}

/**
 * Retrieve metrics summary for a given time range.
 * Returns per-platform daily counters.
 */
/**
 * @description 获取channelmetrics
 * @param input - 输入数据
 * @returns Promise<ChannelMetricsSummary>
 */
export async function getChannelMetrics(input: {
  platform?: string
  since: Date
  until?: Date
}): Promise<ChannelMetricsSummary> {
  const until = input.until ?? new Date()
  const days: Array<{ date: string; keys: string[] }> = []

  for (let d = new Date(input.since); d <= until; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().slice(0, 10)
    days.push({ date, keys: [] })
  }

  // Build all metric keys to fetch
  const allKeys: string[] = []
  const metrics: MetricName[] = [
    "received", "duplicate", "rate_limited", "ingress_rejected",
    "pipeline_started", "pipeline_completed", "pipeline_failed",
    "reply_sent", "reply_dead_letter",
  ]

  for (const day of days) {
    for (const metric of metrics) {
      const keyPattern = input.platform
        ? [KEY_PREFIX, metric, input.platform, day.date].join(":")
        : null
      if (keyPattern) {
        day.keys.push(keyPattern)
        allKeys.push(keyPattern)
      }
    }
  }

  if (allKeys.length === 0) {
    return { days: [], total: { received: 0, duplicate: 0, rate_limited: 0, ingress_rejected: 0, pipeline_started: 0, pipeline_completed: 0, pipeline_failed: 0, reply_sent: 0, reply_dead_letter: 0 }, duplicateRate: 0, pipelineSuccessRate: 0, replySuccessRate: 0 }
  }

  try {
    const values = await redis.mget(...allKeys)
    const keyToValue = new Map<string, number>()
    for (let i = 0; i < allKeys.length; i++) {
      keyToValue.set(allKeys[i], parseInt(values[i] as string, 10) || 0)
    }

    // Parse metrics back from key format: aim:metrics:{metric}:{platform}:{date}
    const daySummaries: Array<Record<string, string | number>> = days.map((day) => {
      const counts: Record<string, number> = {}
      for (const key of day.keys) {
        const parts = key.split(":")
        const metric = parts[2]
        counts[metric] = keyToValue.get(key) ?? 0
      }
      return { date: day.date, ...counts }
    })

    // Compute totals
    const total: Record<string, number> = {}
    for (const metric of metrics) {
      total[metric] = daySummaries.reduce((sum, day) => sum + ((day[metric] as number) ?? 0), 0)
    }

    const received = total["received"] ?? 0
    const duplicates = total["duplicate"] ?? 0
    const pipelineCompleted = total["pipeline_completed"] ?? 0
    const pipelineFailed = total["pipeline_failed"] ?? 0
    const pipelineTotal = pipelineCompleted + pipelineFailed
    const replySent = total["reply_sent"] ?? 0
    const replyDead = total["reply_dead_letter"] ?? 0
    const replyTotal = replySent + replyDead

    return {
      days: daySummaries,
      total: total as unknown as ChannelMetricsSummary["total"],
      duplicateRate: received > 0 ? duplicates / received : 0,
      pipelineSuccessRate: pipelineTotal > 0 ? pipelineCompleted / pipelineTotal : 0,
      replySuccessRate: replyTotal > 0 ? replySent / replyTotal : 0,
    }
  } catch {
    return { days: [], total: { received: 0, duplicate: 0, rate_limited: 0, ingress_rejected: 0, pipeline_started: 0, pipeline_completed: 0, pipeline_failed: 0, reply_sent: 0, reply_dead_letter: 0 }, duplicateRate: 0, pipelineSuccessRate: 0, replySuccessRate: 0 }
  }
}

export interface ChannelMetricsSummary {
  days: Array<Record<string, string | number>>
  total: {
    received: number
    duplicate: number
    rate_limited: number
    ingress_rejected: number
    pipeline_started: number
    pipeline_completed: number
    pipeline_failed: number
    reply_sent: number
    reply_dead_letter: number
  }
  duplicateRate: number
  pipelineSuccessRate: number
  replySuccessRate: number
}

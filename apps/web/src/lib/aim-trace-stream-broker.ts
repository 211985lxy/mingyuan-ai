import { env } from "@/env"
import Redis from "ioredis"

const TRACE_CHANNEL_PREFIX = "aim:trace:"
const DEFAULT_IDLE_MS = 90_000
const DEFAULT_MAX_PER_USER = 3
const DEFAULT_MAX_PER_MINUTE = 30
const DEFAULT_MAX_PER_INSTANCE = 200

export type TraceStreamMetrics = {
  active: number
  rejected: number
  timedOut: number
  redisErrors: number
}

type SubscribeInput = {
  userId: string
  traceId: string
  onMessage: (raw: string) => void
  idleMs?: number
}

export type AcceptCheckResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "redis_unavailable" | "instance_full"; status: 429 | 503 }

export type SubscribeResult =
  | { ok: true; unsubscribe: () => void }
  | { ok: false; reason: "rate_limited" | "redis_unavailable" | "instance_full"; status: 429 | 503 }

type LocalListener = {
  userId: string
  onMessage: (raw: string) => void
  idleTimer?: ReturnType<typeof setTimeout>
  idleMs: number
  onIdle: () => void
}

/**
 * 进程级 Trace SSE 订阅总线：每个实例只维护一个 Redis 订阅客户端。
 */
export class AimTraceStreamBroker {
  private static instance: AimTraceStreamBroker | null = null

  private subscriber: Redis | null = null
  private connectPromise: Promise<Redis> | null = null
  private readonly listeners = new Map<string, Set<LocalListener>>()
  private readonly userActive = new Map<string, number>()
  private readonly userMinuteBuckets = new Map<string, { windowStart: number; count: number }>()
  private metrics: TraceStreamMetrics = {
    active: 0,
    rejected: 0,
    timedOut: 0,
    redisErrors: 0,
  }

  static getInstance(): AimTraceStreamBroker {
    if (!AimTraceStreamBroker.instance) {
      AimTraceStreamBroker.instance = new AimTraceStreamBroker()
    }
    return AimTraceStreamBroker.instance
  }

  /** 测试用：重置单例 */
  static resetForTests(): void {
    AimTraceStreamBroker.instance = null
  }

  getMetrics(): TraceStreamMetrics {
    return { ...this.metrics }
  }

  /** 打开 SSE 前探测配额与 Redis，不占用并发名额。 */
  async canAccept(userId: string): Promise<AcceptCheckResult> {
    const quota = this.checkQuota(userId)
    if (!quota.ok) return quota
    try {
      await this.ensureSubscriber()
      return { ok: true }
    } catch {
      this.metrics.redisErrors += 1
      return { ok: false, reason: "redis_unavailable", status: 503 }
    }
  }

  private createListener(
    input: SubscribeInput,
    channel: string,
    redis: Redis,
  ): { listener: LocalListener; unsubscribe: () => void } {
    const idleMs = input.idleMs ?? DEFAULT_IDLE_MS
    const listener: LocalListener = {
      userId: input.userId,
      onMessage: input.onMessage,
      idleMs,
      onIdle: () => undefined,
    }

    const unsubscribe = () => {
      if (listener.idleTimer) clearTimeout(listener.idleTimer)
      const set = this.listeners.get(channel)
      if (set) {
        set.delete(listener)
        if (set.size === 0) {
          this.listeners.delete(channel)
          void redis.unsubscribe(channel).catch(() => {
            this.metrics.redisErrors += 1
          })
        }
      }
      const next = (this.userActive.get(input.userId) ?? 1) - 1
      if (next <= 0) this.userActive.delete(input.userId)
      else this.userActive.set(input.userId, next)
      this.metrics.active = Math.max(0, this.metrics.active - 1)
    }

    listener.onIdle = () => {
      this.metrics.timedOut += 1
      unsubscribe()
    }

    const bumpIdle = () => {
      if (listener.idleTimer) clearTimeout(listener.idleTimer)
      listener.idleTimer = setTimeout(listener.onIdle, idleMs)
    }

    listener.onMessage = (raw: string) => {
      bumpIdle()
      input.onMessage(raw)
    }

    return { listener, unsubscribe }
  }

  async subscribe(input: SubscribeInput): Promise<SubscribeResult> {
    const quota = this.checkQuota(input.userId)
    if (!quota.ok) {
      this.metrics.rejected += 1
      return quota
    }
    if (!this.consumeMinuteSlot(input.userId)) {
      this.metrics.rejected += 1
      return { ok: false, reason: "rate_limited", status: 429 }
    }

    const userActive = this.userActive.get(input.userId) ?? 0
    let redis: Redis
    try {
      redis = await this.ensureSubscriber()
    } catch {
      this.metrics.redisErrors += 1
      this.metrics.rejected += 1
      return { ok: false, reason: "redis_unavailable", status: 503 }
    }

    const channel = `${TRACE_CHANNEL_PREFIX}${input.traceId}`
    const { listener, unsubscribe } = this.createListener(input, channel, redis)

    let set = this.listeners.get(channel)
    if (!set) {
      set = new Set()
      this.listeners.set(channel, set)
      try {
        await redis.subscribe(channel)
      } catch {
        this.metrics.redisErrors += 1
        this.metrics.rejected += 1
        return { ok: false, reason: "redis_unavailable", status: 503 }
      }
    }

    set.add(listener)
    this.userActive.set(input.userId, userActive + 1)
    this.metrics.active += 1
    if (listener.idleTimer) clearTimeout(listener.idleTimer)
    listener.idleTimer = setTimeout(listener.onIdle, listener.idleMs)

    return { ok: true, unsubscribe }
  }

  private checkQuota(userId: string): AcceptCheckResult {
    if (this.metrics.active >= DEFAULT_MAX_PER_INSTANCE) {
      return { ok: false, reason: "instance_full", status: 429 }
    }
    const userActive = this.userActive.get(userId) ?? 0
    if (userActive >= DEFAULT_MAX_PER_USER) {
      return { ok: false, reason: "rate_limited", status: 429 }
    }
    const now = Date.now()
    const bucket = this.userMinuteBuckets.get(userId)
    if (bucket && now - bucket.windowStart < 60_000 && bucket.count >= DEFAULT_MAX_PER_MINUTE) {
      return { ok: false, reason: "rate_limited", status: 429 }
    }
    return { ok: true }
  }

  private consumeMinuteSlot(userId: string): boolean {
    const now = Date.now()
    const bucket = this.userMinuteBuckets.get(userId)
    if (!bucket || now - bucket.windowStart >= 60_000) {
      this.userMinuteBuckets.set(userId, { windowStart: now, count: 1 })
      return true
    }
    if (bucket.count >= DEFAULT_MAX_PER_MINUTE) return false
    bucket.count += 1
    return true
  }

  private async ensureSubscriber(): Promise<Redis> {
    if (this.subscriber && ["ready", "connecting", "connect"].includes(this.subscriber.status)) {
      if (this.subscriber.status === "ready") return this.subscriber
    }
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = (async () => {
      const client = new Redis(env.REDIS_URL ?? "redis://localhost:6379", {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 5000,
        enableOfflineQueue: false,
      })
      client.on("error", () => {
        this.metrics.redisErrors += 1
      })
      client.on("message", (channel: string, message: string) => {
        const set = this.listeners.get(channel)
        if (!set) return
        for (const listener of set) {
          try {
            listener.onMessage(message)
          } catch {
            // ignore listener errors
          }
        }
      })
      await client.connect()
      this.subscriber = client
      return client
    })()

    try {
      return await this.connectPromise
    } catch (error) {
      this.connectPromise = null
      this.subscriber = null
      throw error
    }
  }
}

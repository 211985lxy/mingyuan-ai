import { beforeEach, describe, expect, it, vi } from "vitest"

describe("AimTraceStreamBroker", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("reuses one instance and rejects a 4th concurrent stream per user", async () => {
    vi.doMock("ioredis", () => {
      class RedisMock {
        status = "ready"
        connect = vi.fn(async () => undefined)
        subscribe = vi.fn(async () => undefined)
        unsubscribe = vi.fn(async () => undefined)
        quit = vi.fn(async () => undefined)
        on = vi.fn()
      }
      return { default: RedisMock }
    })
    vi.doMock("@/env", () => ({
      env: { REDIS_URL: "redis://localhost:6379", NODE_ENV: "test" },
    }))

    const { AimTraceStreamBroker } = await import("@/lib/aim-trace-stream-broker")
    AimTraceStreamBroker.resetForTests()
    const a = AimTraceStreamBroker.getInstance()
    const b = AimTraceStreamBroker.getInstance()
    expect(a).toBe(b)

    const results = []
    for (let i = 0; i < 3; i++) {
      results.push(await a.subscribe({
        userId: "u1",
        traceId: `t-${i}`,
        onMessage: () => undefined,
      }))
    }
    expect(results.map((r) => ("ok" in r ? r.ok : false))).toEqual([true, true, true])
    const handlers = results.flatMap((r) => (r.ok ? [r.unsubscribe] : []))

    const fourth = await a.subscribe({
      userId: "u1",
      traceId: "t-3",
      onMessage: () => undefined,
    })
    expect(fourth.ok).toBe(false)
    if (!fourth.ok) expect(fourth.status).toBe(429)

    for (const unsub of handlers) unsub()
    expect(a.getMetrics().active).toBe(0)
  })
})

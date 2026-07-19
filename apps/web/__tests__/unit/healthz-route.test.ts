import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  databaseCheck: vi.fn(),
  redisPing: vi.fn(),
  redisStatusSet: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: mocks.databaseCheck },
}))

vi.mock("@/lib/redis", () => ({
  redis: { ping: mocks.redisPing },
}))

vi.mock("@/lib/metrics", () => ({
  redisConnectionStatus: { set: mocks.redisStatusSet },
}))

vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.warn },
}))

vi.mock("@/lib/release-facts", () => ({
  getReleaseFacts: () => ({ releaseSha: "test-sha", buildTime: "test-time", version: "test-version" }),
  computeFeishuWorkItemReady: () => false,
  computeProxyReady: () => false,
}))

import { GET } from "@/app/api/healthz/route"

describe("healthz route", () => {
  it("does not expose dependency error details to anonymous callers", async () => {
    mocks.databaseCheck.mockRejectedValueOnce(new Error("connect ECONNREFUSED db.internal:3306"))
    mocks.redisPing.mockRejectedValueOnce(new Error("redis://cache.internal:6379 unavailable"))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.checks.database).toMatchObject({ ok: false, error: "unavailable" })
    expect(body.checks.redis).toMatchObject({ ok: false, error: "unavailable" })
    expect(JSON.stringify(body)).not.toContain("internal")
    expect(mocks.warn).toHaveBeenCalledTimes(2)
    expect(mocks.redisStatusSet).toHaveBeenCalledWith(0)
  })
})

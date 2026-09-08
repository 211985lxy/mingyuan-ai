import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aimSnapshots: vi.fn().mockResolvedValue({ count: 1 }),
  staleTraces: vi.fn().mockResolvedValue({ count: 4 }),
  staleGenerations: vi.fn().mockResolvedValue(2),
  hotItems: vi.fn().mockResolvedValue({ count: 2 }),
  hotSnapshots: vi.fn().mockResolvedValue({ count: 3 }),
  smsCodes: vi.fn().mockResolvedValue({ count: 0 }),
}))

vi.mock("@/lib/admin-auth", () => ({ validateCronSecret: vi.fn().mockReturnValue(true) }))
vi.mock("@/lib/aim/generation-attempt", () => ({
  sweepStaleAimGenerations: mocks.staleGenerations,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimRunSnapshot: { deleteMany: mocks.aimSnapshots },
    aimExecutionTrace: { updateMany: mocks.staleTraces },
    douyinHotItem: { deleteMany: mocks.hotItems },
    douyinHotSnapshot: { deleteMany: mocks.hotSnapshots },
    smsVerificationCode: { deleteMany: mocks.smsCodes },
  },
}))

import { GET } from "@/app/api/cron/cleanup/route"

describe("cleanup retention", () => {
  afterEach(() => vi.useRealTimers())

  it("deletes Harness snapshots as soon as expiresAt passes", async () => {
    const now = new Date("2026-07-14T00:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const response = await GET(new Request("https://example.com/api/cron/cleanup") as never)

    expect(response.status).toBe(200)
    expect(mocks.aimSnapshots).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } })
    expect(mocks.smsCodes).toHaveBeenCalled()
  })

  it("marks traces still running after 10 minutes as STALE_EXECUTION without deleting them", async () => {
    const now = new Date("2026-07-14T00:10:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const response = await GET(new Request("https://example.com/api/cron/cleanup") as never)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.staleTraces).toBe(4)
    expect(mocks.staleTraces).toHaveBeenCalledWith({
      where: { status: "running", updatedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) } },
      data: {
        status: "failed",
        errorCode: "STALE_EXECUTION",
        errorMessage: "执行超时未结束，已自动标记失败",
      },
    })
  })

  it("marks hanging generation tasks as STALE_EXECUTION without deleting them", async () => {
    const now = new Date("2026-07-14T00:10:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const response = await GET(new Request("https://example.com/api/cron/cleanup") as never)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(mocks.staleGenerations).toHaveBeenCalledWith(now)
    expect(body.staleGenerations).toBe(2)
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aimSnapshots: vi.fn().mockResolvedValue({ count: 1 }),
  hotItems: vi.fn().mockResolvedValue({ count: 2 }),
  hotSnapshots: vi.fn().mockResolvedValue({ count: 3 }),
}))

vi.mock("@/lib/admin-auth", () => ({ validateCronSecret: vi.fn().mockReturnValue(true) }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimRunSnapshot: { deleteMany: mocks.aimSnapshots },
    douyinHotItem: { deleteMany: mocks.hotItems },
    douyinHotSnapshot: { deleteMany: mocks.hotSnapshots },
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
  })
})

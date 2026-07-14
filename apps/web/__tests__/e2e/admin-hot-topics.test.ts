import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  prisma, cleanDatabase, disconnectAll, cleanRedis,
  createAdminUser, authReq, json,
} from "./helpers"
import { GET as HISTORY } from "@/app/api/admin/hot-topics/history/route"
import { GET as STATS } from "@/app/api/admin/hot-topics/stats/route"

let admin: { id: string; email: string; role: string }
let snapshotCountBefore = 0
let success24hBefore = 0
let failed24hBefore = 0
let success7dBefore = 0
let failed7dBefore = 0

describe("Admin Hot Topics E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const a = await createAdminUser()
    admin = { id: a.id, email: a.email, role: a.role }

    // Seed snapshots at various times
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    ;[
      snapshotCountBefore,
      success24hBefore,
      failed24hBefore,
      success7dBefore,
      failed7dBefore,
    ] = await Promise.all([
      prisma.douyinHotSnapshot.count(),
      prisma.douyinHotSnapshot.count({
        where: { fetchedAt: { gte: oneDayAgo }, status: "success" },
      }),
      prisma.douyinHotSnapshot.count({
        where: { fetchedAt: { gte: oneDayAgo }, status: "failed" },
      }),
      prisma.douyinHotSnapshot.count({
        where: { fetchedAt: { gte: sevenDaysAgo }, status: "success" },
      }),
      prisma.douyinHotSnapshot.count({
        where: { fetchedAt: { gte: sevenDaysAgo }, status: "failed" },
      }),
    ])

    await prisma.douyinHotSnapshot.createMany({
      data: [
        { batchId: "recent-ok", itemCount: 50, status: "success", fetchedAt: now },
        { batchId: "recent-fail", itemCount: 0, status: "failed", fetchedAt: now },
        { batchId: "2d-ago", itemCount: 48, status: "success", fetchedAt: twoDaysAgo },
        { batchId: "5d-ago", itemCount: 45, status: "success", fetchedAt: fiveDaysAgo },
      ],
    })
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  it("returns snapshot history sorted by fetchedAt desc", async () => {
    const res = await HISTORY(
      authReq("/api/admin/hot-topics/history", admin),
      undefined as never
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.results.length).toBe(snapshotCountBefore + 4)
    expect(body.data.total).toBe(snapshotCountBefore + 4)
    // First result should be the most recent
    expect(body.data.results[0].batchId).toMatch(/recent/)
  })

  it("paginates history", async () => {
    const res = await HISTORY(
      authReq("/api/admin/hot-topics/history?page=1&pageSize=2", admin),
      undefined as never
    )
    const body = await json(res)
    expect(body.data.results.length).toBe(2)
    expect(body.data.total).toBe(snapshotCountBefore + 4)
  })

  it("returns accurate stats for 24h and 7d", async () => {
    const res = await STATS(
      authReq("/api/admin/hot-topics/stats", admin),
      undefined as never
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.last24h.success).toBe(success24hBefore + 1)
    expect(body.data.last24h.failed).toBe(failed24hBefore + 1)
    expect(body.data.last7d.success).toBe(success7dBefore + 3)
    expect(body.data.last7d.failed).toBe(failed7dBefore + 1)
  })
})

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  prisma, cleanDatabase, disconnectAll, cleanRedis,
  req, cronReq, json,
} from "./helpers"
import { GET as CLEANUP } from "@/app/api/cron/cleanup/route"

describe("Cron Endpoints E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  // ─── Auth ─────────────────────────────────────────────

  it("rejects cleanup without cron secret", async () => {
    const res = await CLEANUP(req("/api/cron/cleanup"))
    expect(res.status).toBe(401)
  })

  it("rejects cleanup with wrong cron secret", async () => {
    const res = await CLEANUP(
      req("/api/cron/cleanup", {
        headers: { Authorization: "Bearer wrong" },
      })
    )
    expect(res.status).toBe(401)
  })

  // ─── Cleanup ──────────────────────────────────────────

  it("cleans up old data from real database", async () => {
    const now = new Date()
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    const hundredDaysAgo = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000)

    // Seed old hot items (>30 days)
    await prisma.douyinHotItem.createMany({
      data: [
        {
          sentenceId: "old1",
          word: "旧话题1",
          hotValue: 100,
          position: 1,
          label: 0,
          eventTime: fortyDaysAgo,
          fetchedAt: fortyDaysAgo,
          batchId: "old-batch",
        },
        {
          sentenceId: "old2",
          word: "旧话题2",
          hotValue: 200,
          position: 2,
          label: 0,
          eventTime: fortyDaysAgo,
          fetchedAt: fortyDaysAgo,
          batchId: "old-batch",
        },
      ],
    })

    // Seed fresh hot item (should NOT be deleted)
    await prisma.douyinHotItem.create({
      data: {
        sentenceId: "new1",
        word: "新话题",
        hotValue: 9999,
        position: 1,
        label: 0,
        eventTime: now,
        fetchedAt: now,
        batchId: "fresh-batch",
      },
    })

    // Seed old snapshot (>90 days)
    await prisma.douyinHotSnapshot.create({
      data: {
        batchId: "ancient-batch",
        itemCount: 50,
        status: "success",
        fetchedAt: hundredDaysAgo,
      },
    })

    // Seed fresh snapshot (should NOT be deleted)
    await prisma.douyinHotSnapshot.create({
      data: {
        batchId: "fresh-snap",
        itemCount: 50,
        status: "success",
        fetchedAt: now,
      },
    })

    const res = await CLEANUP(cronReq("/api/cron/cleanup"))
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.ok).toBe(true)
    expect(body.deleted.hotItems).toBe(2)   // 2 old items
    expect(body.deleted.snapshots).toBe(1)  // 1 ancient snapshot

    // Verify the fresh data survived
    const remainingItems = await prisma.douyinHotItem.count()
    expect(remainingItems).toBe(1) // only fresh one

    const remainingSnaps = await prisma.douyinHotSnapshot.count()
    expect(remainingSnaps).toBe(1) // only fresh one
  })
})

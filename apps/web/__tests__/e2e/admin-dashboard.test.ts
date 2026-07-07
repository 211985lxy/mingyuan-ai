import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  prisma, cleanDatabase, disconnectAll, cleanRedis,
  createAdminUser, createTemplate, req, authReq, json,
} from "./helpers"
import { GET } from "@/app/api/admin/dashboard/route"

let admin: { id: string; email: string; role: string }

describe("Admin Dashboard E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const a = await createAdminUser()
    admin = { id: a.id, email: a.email, role: a.role }

    // Seed data for dashboard metrics
    await prisma.user.create({
      data: {
        email: "u1@test.com",
        password: "x",
        name: "User1",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    await prisma.user.create({
      data: {
        email: "u2@test.com",
        password: "x",
        name: "User2",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    await createTemplate(admin.id, { status: "published", publishedAt: new Date() })
    await createTemplate(admin.id, { name: "pub2", status: "published", publishedAt: new Date() })
    await createTemplate(admin.id, { name: "draft1", status: "draft" })

    // Seed hot snapshots
    await prisma.douyinHotSnapshot.create({
      data: { batchId: "b1", itemCount: 50, status: "success" },
    })
    await prisma.douyinHotSnapshot.create({
      data: { batchId: "b2", itemCount: 0, status: "failed" },
    })
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  it("rejects unauthenticated request", async () => {
    const res = await GET(req("/api/admin/dashboard"), undefined as never)
    expect(res.status).toBe(401)
  })

  it("returns correct dashboard metrics from real DB", async () => {
    const res = await GET(
      authReq("/api/admin/dashboard", admin),
      undefined as never
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.totalUsers).toBe(2)
    expect(body.data.activeTemplates).toBe(2) // 2 published
    expect(body.data.hotListHealth.successLast24h).toBe(1)
    expect(body.data.hotListHealth.failedLast24h).toBe(1)
  })
})

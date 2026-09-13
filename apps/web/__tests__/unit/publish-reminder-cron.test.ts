import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  validateCronSecret: vi.fn(),
  isPublishReminderEnabled: vi.fn(),
  listPublishReminderDue: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ validateCronSecret: mocks.validateCronSecret }))
vi.mock("@/lib/aim/publish-reminder", () => ({
  isPublishReminderEnabled: mocks.isPublishReminderEnabled,
  listPublishReminderDue: mocks.listPublishReminderDue,
}))
vi.mock("@/lib/prisma", () => ({ prisma: { aimGeneration: { findMany: vi.fn() } } }))

import { GET, maxDuration } from "@/app/api/cron/publish-reminder/route"

function request() {
  return new NextRequest("http://localhost/api/cron/publish-reminder")
}

describe("GET /api/cron/publish-reminder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateCronSecret.mockReturnValue(true)
    mocks.isPublishReminderEnabled.mockReturnValue(false)
  })

  it("fails closed without a valid cron secret", async () => {
    mocks.validateCronSecret.mockReturnValue(false)
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(mocks.listPublishReminderDue).not.toHaveBeenCalled()
  })

  it("开关关闭时空转", async () => {
    const response = await GET(request())
    expect(maxDuration).toBe(60)
    await expect(response.json()).resolves.toMatchObject({ ok: true, enabled: false, due: 0 })
    expect(mocks.listPublishReminderDue).not.toHaveBeenCalled()
  })

  it("开关打开后只返回待回填清单，不外发", async () => {
    mocks.isPublishReminderEnabled.mockReturnValue(true)
    mocks.listPublishReminderDue.mockResolvedValue([{ id: "g1" }, { id: "g2" }])
    const response = await GET(request())
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      enabled: true,
      due: 2,
      ids: ["g1", "g2"],
    })
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  validateCronSecret: vi.fn(),
  runPrismaOutcomeAutofetch: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ validateCronSecret: mocks.validateCronSecret }))
vi.mock("@/lib/aim/outcome-autofetch-store", () => ({
  runPrismaOutcomeAutofetch: mocks.runPrismaOutcomeAutofetch,
}))

import { GET, maxDuration } from "@/app/api/cron/outcome-autofetch/route"

function request() {
  return new NextRequest("http://localhost/api/cron/outcome-autofetch")
}

describe("GET /api/cron/outcome-autofetch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateCronSecret.mockReturnValue(true)
    mocks.runPrismaOutcomeAutofetch.mockResolvedValue({
      usersProcessed: 1,
      upserted: 2,
      unmatched: 0,
      tooEarly: 0,
      tokenMissing: 0,
      tokenExpired: 0,
      accountErrors: 0,
      needsBackfill: [],
    })
  })

  it("fails closed without a valid cron secret", async () => {
    mocks.validateCronSecret.mockReturnValue(false)
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(mocks.runPrismaOutcomeAutofetch).not.toHaveBeenCalled()
  })

  it("runs autofetch once and returns the summary", async () => {
    const response = await GET(request())
    expect(maxDuration).toBe(120)
    expect(mocks.runPrismaOutcomeAutofetch).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      upserted: 2,
      usersProcessed: 1,
    })
  })
})

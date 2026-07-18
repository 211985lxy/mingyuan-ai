import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// 每周经营复盘路由测试（90 天计划 3.3）。

const { authenticateRequest, authErrorResponse, computeWeeklyReview } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  computeWeeklyReview: vi.fn(async (_input: { userId: string; start: Date; end: Date }) => ({
    periodStart: "2026-07-11T00:00:00.000Z",
    periodEnd: "2026-07-18T00:00:00.000Z",
    publishedCount: 3,
    qualifiedLeadCount: 5,
    appointmentCount: 2,
    dealCount: 1,
    revenue: 9800,
    referencedAssetCount: 4,
    reusedAssetCount: 2,
    day7Backfill: { due: 3, filled: 2 },
  })),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/aim/weekly-review", () => ({ computeWeeklyReview }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { GET } from "@/app/api/aim/review/weekly/route"

describe("GET /api/aim/review/weekly", () => {
  beforeEach(() => vi.clearAllMocks())

  it("缺省周期为最近 7 天，返回五主指标", async () => {
    const res = await GET(new NextRequest("http://localhost/api/aim/review/weekly"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.review.publishedCount).toBe(3)
    expect(body.review.day7Backfill).toEqual({ due: 3, filled: 2 })
    expect(computeWeeklyReview).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    )
  })

  it("显式 start/end 透传", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/aim/review/weekly?start=2026-07-06&end=2026-07-13"),
    )
    expect(res.status).toBe(200)
    const call = computeWeeklyReview.mock.calls[0][0]
    expect(call.start.toISOString()).toContain("2026-07-06")
    expect(call.end.toISOString()).toContain("2026-07-13")
  })

  it("非法日期 → 400", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/aim/review/weekly?start=not-a-date"),
    )
    expect(res.status).toBe(400)
  })

  it("start 不早于 end → 400", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/aim/review/weekly?start=2026-07-13&end=2026-07-06"),
    )
    expect(res.status).toBe(400)
  })

  it("未认证 → 401", async () => {
    authenticateRequest.mockRejectedValueOnce(new Error("unauthorized"))
    authErrorResponse.mockReturnValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) as never,
    )
    const res = await GET(new NextRequest("http://localhost/api/aim/review/weekly"))
    expect(res.status).toBe(401)
  })
})

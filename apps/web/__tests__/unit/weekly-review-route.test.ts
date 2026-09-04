import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// 每周经营复盘路由测试（90 天计划 3.3）。

const { authenticateRequest, authErrorResponse, computeWeeklyReview, computeTaskAttributionInsights, fetchCreatorMetrics, projectFindFirst } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  fetchCreatorMetrics: vi.fn(async (_input: { start: Date; end: Date }) => ({
    status: "not_configured",
    message: "未配置创作者数据总线的飞书 Base",
  })),
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
  computeTaskAttributionInsights: vi.fn(async (_input: { userId: string; start: Date; end: Date }) => [
    {
      contentTask: "吸引目标客户",
      publishedCount: 3,
      viewsTotal: 12000,
      traceableLeadCount: 2,
      unknownLeadCount: 1,
      sampleNote: null,
    },
  ]),
  projectFindFirst: vi.fn<() => Promise<{ id: string } | null>>(async () => ({ id: "project-1" })),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/aim/weekly-review", () => ({ computeWeeklyReview }))
vi.mock("@/lib/aim/attribution-insights", () => ({ computeTaskAttributionInsights }))
vi.mock("@/lib/aim/creator-metrics", () => ({ fetchCreatorMetrics }))
vi.mock("@/lib/prisma", () => ({ prisma: { clientProject: { findFirst: projectFindFirst } } }))

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

  it("附带创作者平台表现，与复盘同周期", async () => {
    const res = await GET(new NextRequest("http://localhost/api/aim/review/weekly"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.platformMetrics).toEqual({ status: "not_configured", message: expect.any(String) })
    const call = fetchCreatorMetrics.mock.calls[0][0]
    expect(call.start).toBeInstanceOf(Date)
    expect(call.end).toBeInstanceOf(Date)
  })

  it("附带选题归因聚合，与复盘同周期同范围（WP-D）", async () => {
    const res = await GET(new NextRequest("http://localhost/api/aim/review/weekly"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.taskInsights).toEqual([
      expect.objectContaining({ contentTask: "吸引目标客户", traceableLeadCount: 2, unknownLeadCount: 1 }),
    ])
    expect(computeTaskAttributionInsights).toHaveBeenCalledWith(
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

  it("验证项目归属并传入周复盘", async () => {
    const res = await GET(new NextRequest("http://localhost/api/aim/review/weekly?projectId=project-1"))
    expect(res.status).toBe(200)
    expect(projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "project-1", userId: "user-1", status: "active" } }))
    expect(computeWeeklyReview).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1" }))
  })

  it("拒绝其他用户的项目", async () => {
    projectFindFirst.mockResolvedValueOnce(null)
    const res = await GET(new NextRequest("http://localhost/api/aim/review/weekly?projectId=project-2"))
    expect(res.status).toBe(404)
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

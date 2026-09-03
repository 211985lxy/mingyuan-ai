import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// 创作者数据总线路由：鉴权 / 参数校验 / not_configured 降级透传。

const { authenticateRequest, authErrorResponse, fetchCreatorMetrics, projectFindFirst } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  fetchCreatorMetrics: vi.fn(async (_input: { start: Date; end: Date }) => ({
    status: "not_configured",
    message: "未配置创作者数据总线的飞书 Base",
  })),
  projectFindFirst: vi.fn<() => Promise<{ id: string } | null>>(async () => ({ id: "project-1" })),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/aim/creator-metrics", () => ({ fetchCreatorMetrics }))
vi.mock("@/lib/prisma", () => ({ prisma: { clientProject: { findFirst: projectFindFirst } } }))

import { GET } from "@/app/api/aim/creator-metrics/route"

describe("GET /api/aim/creator-metrics", () => {
  beforeEach(() => vi.clearAllMocks())

  it("缺省周期最近 7 天，返回总线响应", async () => {
    const res = await GET(new NextRequest("http://localhost/api/aim/creator-metrics"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("not_configured")
    const call = fetchCreatorMetrics.mock.calls[0][0]
    expect(call.end.getTime() - call.start.getTime()).toBe(7 * 24 * 3600 * 1000)
  })

  it("显式 start/end 透传", async () => {
    await GET(new NextRequest("http://localhost/api/aim/creator-metrics?start=2026-08-31&end=2026-09-07"))
    const call = fetchCreatorMetrics.mock.calls[0][0]
    expect(call.start.toISOString()).toContain("2026-08-31")
    expect(call.end.toISOString()).toContain("2026-09-07")
  })

  it("start 晚于 end 返回 400", async () => {
    const res = await GET(new NextRequest("http://localhost/api/aim/creator-metrics?start=2026-09-07&end=2026-08-31"))
    expect(res.status).toBe(400)
    expect(fetchCreatorMetrics).not.toHaveBeenCalled()
  })

  it("项目不存在返回 404", async () => {
    projectFindFirst.mockResolvedValueOnce(null)
    const res = await GET(new NextRequest("http://localhost/api/aim/creator-metrics?projectId=p-1"))
    expect(res.status).toBe(404)
  })

  it("未认证返回 401", async () => {
    authenticateRequest.mockRejectedValueOnce(new Error("未登录"))
    authErrorResponse.mockReturnValueOnce(new Response("unauthorized", { status: 401 }) as never)
    const res = await GET(new NextRequest("http://localhost/api/aim/creator-metrics"))
    expect(res.status).toBe(401)
  })
})

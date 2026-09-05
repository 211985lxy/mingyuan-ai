import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findFirst, outcomeFindMany, attributionFindMany, authenticateRequest, authErrorResponse } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  outcomeFindMany: vi.fn(async () => []),
  attributionFindMany: vi.fn(async () => []),
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: { findFirst },
    contentOutcome: { findMany: outcomeFindMany },
    outcomeAttribution: { findMany: attributionFindMany },
  },
}))
vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))

import { GET } from "@/app/api/aim/history/[id]/retro-report/route"

function request(id = "gen-1") {
  return new NextRequest(`http://localhost/api/aim/history/${id}/retro-report`, { method: "GET" })
}

/** 模拟 Prisma Decimal（Number() 走 valueOf） */
class FakeDecimal {
  constructor(private readonly value: number) {}
  valueOf() {
    return this.value
  }
}

describe("aim retro-report route（HTML 复盘报告）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    outcomeFindMany.mockResolvedValue([])
    attributionFindMany.mockResolvedValue([])
    findFirst.mockResolvedValue({
      id: "gen-1",
      topicTitle: "选题A",
      rawInput: "原始输入",
      workflowStatus: "published",
      publishPlatform: "douyin",
      publishUrl: "https://example.com/p/1",
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      createdAt: new Date("2026-08-30T00:00:00.000Z"),
      retroSnapshots: [
        { summary: "第一次复盘", createdAt: "2026-09-08T00:00:00.000Z" },
        { summary: "", createdAt: "2026-09-09T00:00:00.000Z" }, // 空 summary 会被过滤
        { summary: "第二次复盘", actualData: "播放 5000", createdAt: "2026-09-15T00:00:00.000Z" },
      ],
    })
  })

  it("返回 text/html 且包含三段结构", async () => {
    const response = await GET(request(), { params: Promise.resolve({ id: "gen-1" }) })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    const html = await response.text()
    expect(html).toContain("复盘报告 · 选题A")
    expect(html).toContain("一、发布数据")
    expect(html).toContain("二、线索归因")
    expect(html).toContain("三、复盘结论")
  })

  it("Decimal 营收转数字、空 summary 快照被过滤、最新复盘在前", async () => {
    outcomeFindMany.mockResolvedValue([
      {
        collectWindowDay: 7,
        collectedAt: new Date("2026-09-08T00:00:00.000Z"),
        platform: "douyin",
        views: 1000,
        likes: null,
        comments: null,
        saves: null,
        shares: null,
        qualifiedCommentCount: null,
        dmCount: 3,
        qualifiedLeadCount: null,
        appointmentCount: null,
        dealCount: 1,
        revenue: new FakeDecimal(1280.5),
        verdictCode: "effective",
        verdictNote: null,
        audienceFeedback: null,
      },
    ])
    const response = await GET(request(), { params: Promise.resolve({ id: "gen-1" }) })
    const html = await response.text()
    expect(html).toContain("1,280.5")
    expect(html).not.toContain('summary": ""')
    expect(html.indexOf("第二次复盘")).toBeLessThan(html.indexOf("第一次复盘"))
  })

  it("跨用户或不存在的内容返回 404", async () => {
    findFirst.mockResolvedValue(null)
    const response = await GET(request("gen-other"), { params: Promise.resolve({ id: "gen-other" }) })
    expect(response.status).toBe(404)
  })
})

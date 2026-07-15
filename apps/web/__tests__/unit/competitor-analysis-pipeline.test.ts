import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  collect: vi.fn(),
  calculate: vi.fn(),
  analyze: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    competitorAnalysis: {
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      update: mocks.update,
    },
  },
}))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: mocks.info, error: mocks.error }) },
}))
vi.mock("@/lib/competitor-analysis/collector", () => ({ collectCompetitorData: mocks.collect }))
vi.mock("@/lib/competitor-analysis/metrics", () => ({ calculateMetrics: mocks.calculate }))
vi.mock("@/lib/competitor-analysis/analyzer", () => ({ analyzeCompetitor: mocks.analyze }))

import { runCompetitorAnalysisPipeline } from "@/lib/competitor-analysis/pipeline"

describe("competitor analysis pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUniqueOrThrow.mockResolvedValue({
      platform: "douyin",
      targetUrl: "https://example.com/account",
      platformUserId: null,
    })
    mocks.collect.mockResolvedValue({
      platformUserId: "account-1",
      account: { nickname: "对标账号", avatar: "avatar", followerCount: 10, videoCount: 2 },
      videos: [{ id: "video-1" }],
      comments: [{ text: "评论" }],
      collectionSource: "api",
      fallbackUsed: false,
      fallbackReason: null,
    })
    mocks.calculate.mockReturnValue({ engagementRate: 1 })
    mocks.analyze.mockResolvedValue({ scores: { overall: 88 } })
    mocks.update.mockResolvedValue({})
  })

  it("persists each pipeline stage in order", async () => {
    await runCompetitorAnalysisPipeline("analysis-1")

    expect(mocks.collect).toHaveBeenCalledWith({
      platform: "douyin",
      targetUrl: "https://example.com/account",
      platformUserId: null,
      count: 50,
    })
    expect(mocks.update.mock.calls.map((call) => call[0].data.status).filter(Boolean)).toEqual([
      "scraping",
      "enriching",
      "analyzing",
      "completed",
    ])
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "analysis-1" },
      data: expect.objectContaining({ status: "completed", overallScore: 88 }),
    }))
  })
})

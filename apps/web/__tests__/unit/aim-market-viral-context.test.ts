import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock prisma to return controlled viral video data
const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    watchAccount: { findMany: mockFindMany },
    videoCopyExtraction: { findFirst: mockFindFirst },
  },
}))

const { buildRawInputWithMarketViralContext, buildRawInputWithVideoCopyContext } = await import(
  "@/lib/aim-generate-context"
)

describe("buildRawInputWithMarketViralContext", () => {
  beforeEach(() => {
    mockFindMany.mockReset()
    mockFindFirst.mockReset()
  })

  it("returns rawInput unchanged when enabled=false", async () => {
    const result = await buildRawInputWithMarketViralContext("user-1", "帮我做定位", false)
    expect(result).toBe("帮我做定位")
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("returns rawInput unchanged when no accounts have viral videos", async () => {
    mockFindMany.mockResolvedValue([
      { nickname: "账号A", targetUrl: "https://a.com", viralVideos: [] },
    ])

    const result = await buildRawInputWithMarketViralContext("user-1", "帮我做定位", true)
    expect(result).toBe("帮我做定位")
  })

  it("appends viral video context with required headings", async () => {
    mockFindMany.mockResolvedValue([
      {
        nickname: "对标账号",
        targetUrl: "https://douyin.com/user/1",
        viralVideos: [
          {
            title: "3个搞钱思路让你少走弯路",
            videoUrl: "https://douyin.com/video/1",
            likes: 5000,
            comments: 200,
            shares: 100,
            collects: 300,
            engagementScore: 6900,
          },
        ],
      },
    ])

    const result = await buildRawInputWithMarketViralContext("user-1", "IP定位方案", true)

    expect(result).toContain("市场洞察爆款作品上下文")
    expect(result).toContain("客户经历资产")
    expect(result).toContain("不得照搬对标账号标题")
    expect(result).toContain("账号分析参考来源")
    expect(result).toContain("内容母题、爆款钩子、受众假设、表达风格")
    expect(result).toContain("TOP 1")
    expect(result).toContain("3个搞钱思路让你少走弯路")
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    )
  })

  it("queries with correct userId for data isolation", async () => {
    mockFindMany.mockResolvedValue([
      {
        nickname: "测试",
        targetUrl: "https://test.com",
        viralVideos: [
          { title: "视频A", likes: 100, engagementScore: 100 },
        ],
      },
    ])

    await buildRawInputWithMarketViralContext("user-42", "输入", true)

    expect(mockFindMany).toHaveBeenCalledTimes(1)
    const callArgs = mockFindMany.mock.calls[0][0] as Record<string, unknown>
    expect((callArgs.where as { userId: string }).userId).toBe("user-42")
  })
})

describe("buildRawInputWithVideoCopyContext", () => {
  beforeEach(() => {
    mockFindFirst.mockReset()
  })

  it("uses analysis markdown instead of JSON when appending video copy context", async () => {
    mockFindFirst.mockResolvedValue({
      videoTitle: "3大靠AI提升认知的心法",
      sourceUrl: "https://douyin.com/video/1",
      transcript: "原视频口播",
      analysisResult: { markdown: "## 结构拆解\n这是可读拆解", topComments: [] },
    })

    const result = await buildRawInputWithVideoCopyContext("user-1", "改成我的文案", "copy-1")

    expect(result).toContain("结构化拆解：\n## 结构拆解")
    expect(result).toContain("这是可读拆解")
    expect(result).toContain("爆款选题再创作 SOP")
    expect(result).toContain("核心选题、开头机制、观点冲突、情绪触发")
    expect(result).toContain("内部建立观点池")
    expect(result).toContain("结构重构、观点重构、表达重构")
    expect(result).not.toContain('"markdown"')
    expect(result).not.toContain("\\n")
  })
})

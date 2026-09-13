import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  fetchVideos: vi.fn(),
  redfoxFetch: vi.fn(),
  hasRedFox: vi.fn(() => true),
}))

vi.mock("@/lib/tikhub/adapters/douyin", () => ({
  DouyinAdapter: class {
    fetchVideos = m.fetchVideos
  },
}))

vi.mock("@/lib/competitor-analysis/redfox-douyin-api", () => ({
  fetchFromRedFoxDouyinApi: m.redfoxFetch,
  hasRedFoxDouyinApi: m.hasRedFox,
}))

const { fetchAccountWorks, hasAnyWorksChannel } = await import("@/lib/aim/account-works-source")

function tikhubVideo(overrides: Record<string, unknown> = {}) {
  return {
    videoId: "aweme_1",
    title: "作品一",
    coverUrl: "https://cover/1",
    videoUrl: "",
    createTime: 1757000000,
    duration: 60,
    views: 1000,
    likes: 100,
    comments: 10,
    shares: 5,
    collects: 20,
    ...overrides,
  }
}

const INPUT = { secUserId: "MS4wLjABAAAAabcdef", profileUrl: "https://www.douyin.com/user/MS4wLjABAAAAabcdef", count: 50 }

beforeEach(() => {
  m.fetchVideos.mockReset()
  m.redfoxFetch.mockReset()
  m.hasRedFox.mockReset()
  m.hasRedFox.mockReturnValue(true)
})

describe("fetchAccountWorks", () => {
  it("主通道 TikHub 成功：不回落，source=tikhub", async () => {
    m.fetchVideos.mockResolvedValue([tikhubVideo()])
    const result = await fetchAccountWorks(INPUT)
    expect(result.source).toBe("tikhub")
    expect(result.fallbackUsed).toBe(false)
    expect(result.fallbackReason).toBeNull()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      externalWorkId: "aweme_1",
      title: "作品一",
      stats: { views: 1000, likes: 100, comments: 10, shares: 5, saves: 20 },
    })
    expect(result.items[0]?.publishedAt).toBe(new Date(1757000000 * 1000).toISOString())
    expect(m.redfoxFetch).not.toHaveBeenCalled()
  })

  it("主通道抛错时回落红狐，错误原因被记录", async () => {
    m.fetchVideos.mockRejectedValue(new Error("HTTP 401"))
    m.redfoxFetch.mockResolvedValue({ videos: [tikhubVideo({ videoId: "aweme_2" })] })
    const result = await fetchAccountWorks(INPUT)
    expect(result.source).toBe("redfox")
    expect(result.fallbackUsed).toBe(true)
    expect(result.fallbackReason).toContain("TikHub")
    expect(result.items[0]?.externalWorkId).toBe("aweme_2")
  })

  it("主通道返回 0 条也视为失败并回落", async () => {
    m.fetchVideos.mockResolvedValue([])
    m.redfoxFetch.mockResolvedValue({ videos: [tikhubVideo({ videoId: "aweme_3" })] })
    const result = await fetchAccountWorks(INPUT)
    expect(result.source).toBe("redfox")
    expect(result.fallbackReason).toContain("0 条")
  })

  it("两条通道都失败：抛错且含双方原因（绝不静默返回空数组）", async () => {
    m.fetchVideos.mockRejectedValue(new Error("HTTP 401"))
    m.redfoxFetch.mockRejectedValue(new Error("优质库暂未收录该内容"))
    await expect(fetchAccountWorks(INPUT)).rejects.toThrow(/作品数据通道均未取到数据/)
    await expect(fetchAccountWorks(INPUT)).rejects.toThrow(/优质库暂未收录/)
  })

  it("红狐未配置时错误信息如实说明", async () => {
    m.fetchVideos.mockRejectedValue(new Error("HTTP 500"))
    m.hasRedFox.mockReturnValue(false)
    await expect(fetchAccountWorks(INPUT)).rejects.toThrow(/REDFOX_API_KEY 未配置/)
  })

  it("缺 sec_user_id 时主通道报明确原因", async () => {
    m.fetchVideos.mockImplementation(() => {
      throw new Error("缺少 sec_user_id（未采集抖音主页链接）")
    })
    m.redfoxFetch.mockResolvedValue({ videos: [tikhubVideo({ videoId: "aweme_4" })] })
    const result = await fetchAccountWorks({ ...INPUT, secUserId: null })
    expect(result.source).toBe("redfox")
    expect(result.fallbackReason).toContain("sec_user_id")
  })

  it("丢弃缺 videoId 的脏数据", async () => {
    m.fetchVideos.mockResolvedValue([tikhubVideo(), tikhubVideo({ videoId: "" })])
    const result = await fetchAccountWorks(INPUT)
    expect(result.items).toHaveLength(1)
  })
})

describe("hasAnyWorksChannel", () => {
  it("两个通道都未配置时返回 false", () => {
    const original = { ...process.env }
    delete process.env.TIKHUB_API_KEY
    delete process.env.TIKHUB_BASE_URL
    delete process.env.REDFOX_API_KEY
    m.hasRedFox.mockReturnValue(false)
    expect(hasAnyWorksChannel()).toBe(false)
    process.env = original
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const tikhubPost = vi.fn()
const redfoxPost = vi.fn()

vi.mock("@/lib/tikhub/client", () => ({
  tikhubPost: (...args: unknown[]) => tikhubPost(...args),
  tikhubGet: vi.fn(),
  TikHubError: class TikHubError extends Error {},
}))

vi.mock("@/lib/redfox/client", () => ({
  redfoxPost: (...args: unknown[]) => redfoxPost(...args),
}))

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}))

describe("DouyinSearchAdapter provider order", () => {
  beforeEach(() => {
    vi.resetModules()
    tikhubPost.mockReset()
    redfoxPost.mockReset()
  })

  it("uses RedFox first and skips TikHub on success", async () => {
    redfoxPost.mockResolvedValue({
      list: [
        {
          workId: "rf1",
          title: "红狐抖音结果",
          accountName: "号主",
          playCount: 99,
        },
      ],
    })

    const { DouyinSearchAdapter } = await import(
      "@/features/opportunities/adapters/douyin-search"
    )
    const result = await new DouyinSearchAdapter().search({
      keyword: "徐沪生",
      count: 5,
    })

    expect(redfoxPost).toHaveBeenCalledWith(
      "/story/api/dyData/searchArticle",
      expect.objectContaining({ keyword: "徐沪生" }),
    )
    expect(tikhubPost).not.toHaveBeenCalled()
    expect(result.status).toBe("ok")
    expect(result.items[0]).toMatchObject({
      sourceId: "rf1",
      title: "红狐抖音结果",
      author: { name: "号主" },
    })
  })

  it("falls back to TikHub V2 only after RedFox fails", async () => {
    redfoxPost.mockRejectedValue(new Error("redfox down"))
    tikhubPost.mockResolvedValue({
      business_data: [
        {
          type: 1,
          data: {
            aweme_info: {
              aweme_id: "v1",
              desc: "徐沪生口播",
              share_url: "https://www.douyin.com/video/v1",
              create_time: 1_700_000_000,
              statistics: { play_count: 1000, digg_count: 20 },
              author: { uid: "u1", nickname: "徐沪生", follower_count: 9 },
              video: { cover: { url_list: ["https://cover"] }, duration: 15000 },
            },
          },
        },
      ],
      cursor: 10,
      has_more: 1,
    })

    const { DouyinSearchAdapter } = await import(
      "@/features/opportunities/adapters/douyin-search"
    )
    const result = await new DouyinSearchAdapter().search({
      keyword: "徐沪生",
      count: 5,
      filters: { sortOrder: "popular" },
    })

    expect(redfoxPost).toHaveBeenCalled()
    expect(tikhubPost).toHaveBeenCalledWith(
      "/api/v1/douyin/search/fetch_video_search_v2",
      expect.objectContaining({
        keyword: "徐沪生",
        sort_type: "1",
        content_type: "1",
      }),
    )
    expect(result.status).toBe("ok")
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      sourceId: "v1",
      title: "徐沪生口播",
      author: { name: "徐沪生" },
      metrics: { views: 1000, likes: 20 },
    })
  })
})

describe("searchWechatChannelsVideos provider order", () => {
  beforeEach(() => {
    vi.resetModules()
    tikhubPost.mockReset()
    redfoxPost.mockReset()
  })

  it("uses RedFox sphData first and skips TikHub on success", async () => {
    redfoxPost.mockResolvedValue({
      list: [
        {
          workId: "sph1",
          title: "红狐视频号",
          accountName: "号主",
          playCount: 12,
        },
      ],
    })

    const { searchWechatChannelsVideos } = await import(
      "@/lib/tikhub/search-wechat-channels-videos"
    )
    const result = await searchWechatChannelsVideos({
      keyword: "徐沪生",
      sortType: "popular",
      count: 3,
    })

    expect(redfoxPost).toHaveBeenCalledWith(
      "/story/api/sphData/searchArticle",
      expect.objectContaining({
        keyword: "徐沪生",
        sortType: "_2",
      }),
    )
    expect(tikhubPost).not.toHaveBeenCalled()
    expect(result.list[0]).toMatchObject({
      object_id: "sph1",
      title: "红狐视频号",
      nickname: "号主",
      play_count: 12,
      work_url: "",
    })
  })

  it("keeps RedFox workUrl and leaves missing playCount as null", async () => {
    redfoxPost.mockResolvedValue({
      list: [
        {
          exportId: "export/UzFfAgtgekIEAQAAAAAAxExampleId01",
          title: "有链接的视频",
          workUrl: "https://channels.weixin.qq.com/s/abc123",
          accountName: "号主",
          likeCount: 900,
        },
      ],
    })

    const { searchWechatChannelsVideos } = await import(
      "@/lib/tikhub/search-wechat-channels-videos"
    )
    const result = await searchWechatChannelsVideos({
      keyword: "供暖",
      sortType: "popular",
      count: 3,
    })

    expect(result.list[0]).toMatchObject({
      title: "有链接的视频",
      work_url: "https://channels.weixin.qq.com/s/abc123",
      play_count: null,
      like_count: 900,
    })
  })

  it("falls back to TikHub fetch_search only after RedFox fails", async () => {
    redfoxPost.mockRejectedValue(new Error("资源不存在"))
    tikhubPost.mockResolvedValue({
      items: [
        {
          title: "视频号标题",
          exportId: "ex1",
          coverUrl: "https://c",
          createTime: 1_700_000_000,
          playCount: 88,
          jumpInfo: { nickName: "号主", userName: "finder1" },
        },
      ],
      cursor: "next",
      continue_flag: true,
    })

    const { searchWechatChannelsVideos } = await import(
      "@/lib/tikhub/search-wechat-channels-videos"
    )
    const result = await searchWechatChannelsVideos({
      keyword: "徐沪生",
      sortType: "popular",
      count: 3,
    })

    expect(redfoxPost).toHaveBeenCalled()
    expect(tikhubPost).toHaveBeenCalledWith(
      "/api/v1/wechat_search/v2/fetch_search",
      expect.objectContaining({
        keyword: "徐沪生",
        business_type: "video",
        sort: "hot",
        raw: false,
      }),
    )
    expect(result.list[0]).toMatchObject({
      object_id: "ex1",
      title: "视频号标题",
      nickname: "号主",
      play_count: 88,
      work_url: "",
    })
  })

  it("builds channels URL from long TikHub exportId when no share link", async () => {
    redfoxPost.mockRejectedValue(new Error("资源不存在"))
    const exportId = "export/UzFfAgtgekIEAQAAAAAAxLongEnoughId"
    tikhubPost.mockResolvedValue({
      items: [
        {
          title: "长 ID 视频",
          exportId,
          likeNum: "1.2万",
          jumpInfo: { nickName: "号主" },
        },
      ],
    })

    const { searchWechatChannelsVideos } = await import(
      "@/lib/tikhub/search-wechat-channels-videos"
    )
    const result = await searchWechatChannelsVideos({ keyword: "老板IP", count: 1 })

    expect(result.list[0]).toMatchObject({
      work_url: `https://channels.weixin.qq.com/video/${exportId}`,
      like_count: 12_000,
      play_count: null,
    })
  })
})

describe("resolveChannelsVideoUrl", () => {
  it("prefers real share/work urls over constructed ids", async () => {
    const { resolveChannelsVideoUrl, isLikelyChannelsVideoId } = await import(
      "@/lib/tikhub/search-wechat-channels-videos"
    )
    expect(
      resolveChannelsVideoUrl({
        workUrl: "https://channels.weixin.qq.com/s/real",
        exportId: "export/UzFfAgtgekIEAQAAAAAAxLongEnoughId",
      }),
    ).toBe("https://channels.weixin.qq.com/s/real")
    expect(isLikelyChannelsVideoId("sph1")).toBe(false)
    expect(isLikelyChannelsVideoId("export/UzFfAgtgekIEAQAAAAAAxLongEnoughId")).toBe(true)
  })
})

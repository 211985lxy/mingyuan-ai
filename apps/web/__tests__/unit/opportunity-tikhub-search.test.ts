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

describe("DouyinSearchAdapter TikHub V2", () => {
  beforeEach(() => {
    vi.resetModules()
    tikhubPost.mockReset()
    redfoxPost.mockReset()
    redfoxPost.mockRejectedValue(new Error("redfox down"))
  })

  it("calls fetch_video_search_v2 and maps aweme_info", async () => {
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

describe("searchWechatChannelsVideos", () => {
  beforeEach(() => {
    vi.resetModules()
    tikhubPost.mockReset()
  })

  it("uses wechat_search fetch_search instead of retired channels path", async () => {
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
    })
  })
})

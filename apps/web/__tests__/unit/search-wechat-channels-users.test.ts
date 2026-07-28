import { beforeEach, describe, expect, it, vi } from "vitest"

const tikhubPost = vi.hoisted(() => vi.fn())

vi.mock("@/lib/tikhub/client", () => ({
  tikhubPost,
  tikhubGet: vi.fn(),
  TikHubError: class TikHubError extends Error {},
}))

describe("searchWechatChannelsUsers", () => {
  beforeEach(() => {
    vi.resetModules()
    tikhubPost.mockReset()
  })

  it("calls fetch_search account vertical and keeps only 视频号 results", async () => {
    tikhubPost.mockResolvedValue({
      items: [
        {
          title: "<em>徐沪生</em>-一条创始人",
          desc: "让文艺和商业发生美好关系",
          accTypeName: "视频号",
          authInfo: "上海一条网络科技有限公司",
          thumbUrl: "https://avatar/channels",
          jumpInfo: {
            userName:
              "v2_060000231003b20faec8c7e48119c2d0ca0de936b077de064fcd5a8db22855d0fc2199751809@finder",
          },
          noticeParam: {
            finderUsername:
              "v2_060000231003b20faec8c7e48119c2d0ca0de936b077de064fcd5a8db22855d0fc2199751809@finder",
          },
        },
        {
          title: "徐沪生",
          desc: "公众号简介",
          accTypeName: "公众号",
          jumpInfo: {
            userName: "gh_6a2d13fc13a3",
            nickName: "徐沪生",
            headImgUrl: "https://avatar/mp",
          },
        },
        {
          title: "路过号",
          accTypeName: "视频号",
          jumpInfo: { userName: "" },
        },
      ],
      cursor: "next-page",
      continue_flag: 1,
    })

    const { searchWechatChannelsUsers } = await import(
      "@/lib/tikhub/search-wechat-channels-users"
    )
    const result = await searchWechatChannelsUsers({ keyword: "徐沪生" })

    expect(tikhubPost).toHaveBeenCalledWith(
      "/api/v1/wechat_search/v2/fetch_search",
      expect.objectContaining({
        keyword: "徐沪生",
        business_type: "account",
        sort: "default",
        raw: false,
      }),
    )
    expect(result.list).toHaveLength(1)
    expect(result.list[0]).toMatchObject({
      finder_username:
        "v2_060000231003b20faec8c7e48119c2d0ca0de936b077de064fcd5a8db22855d0fc2199751809@finder",
      nickname: "徐沪生-一条创始人",
      avatar_url: "https://avatar/channels",
      signature: "让文艺和商业发生美好关系",
      is_verified: true,
    })
    expect(result.cursor).toBe("next-page")
    expect(result.has_more).toBe(true)
  })

  it("treats @finder usernames as channels when accTypeName is missing", async () => {
    tikhubPost.mockResolvedValue({
      items: [
        {
          title: "无名号",
          jumpInfo: { userName: "v2_abc@finder" },
        },
        {
          title: "公众号兜底",
          jumpInfo: { userName: "gh_abc" },
        },
      ],
      continue_flag: false,
    })

    const { searchWechatChannelsUsers } = await import(
      "@/lib/tikhub/search-wechat-channels-users"
    )
    const result = await searchWechatChannelsUsers({ keyword: "无名" })

    expect(result.list).toEqual([
      expect.objectContaining({
        finder_username: "v2_abc@finder",
        nickname: "无名号",
        is_verified: false,
      }),
    ])
  })
})

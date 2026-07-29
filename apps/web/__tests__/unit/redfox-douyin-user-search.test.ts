import { describe, expect, it } from "vitest"

import {
  extractRedFoxDouyinProfileUrl,
  mapRedFoxDouyinUserSearchPayload,
} from "@/lib/redfox/douyin-users"

describe("mapRedFoxDouyinUserSearchPayload", () => {
  it("maps RedFox results into searchable Douyin accounts", () => {
    const results = mapRedFoxDouyinUserSearchPayload({
      list: [
        {
          accountId: "xuhusheng7",
          nickname: "徐沪生-一条创始人",
          avatarUrl: "https://example.com/avatar.jpg",
          signature: "一条创始人",
          followerCount: 109409,
          awemeCount: 321,
          verifyInfo: "已认证",
        },
        { accountId: "", nickname: "无账号标识" },
      ],
    })

    expect(results).toEqual([
      {
        accountId: "xuhusheng7",
        nickname: "徐沪生-一条创始人",
        avatarUrl: "https://example.com/avatar.jpg",
        signature: "一条创始人",
        followerCount: 109409,
        videoCount: 321,
        isVerified: true,
      },
    ])
  })

  it("builds a monitorable profile URL from a RedFox work result", () => {
    expect(extractRedFoxDouyinProfileUrl({
      list: [{ secUid: "MS4wLjABAAAA-test" }],
    })).toBe("https://www.douyin.com/user/MS4wLjABAAAA-test")
    expect(() => extractRedFoxDouyinProfileUrl({ list: [] })).toThrow(
      "红狐暂时无法解析该账号主页",
    )
  })
})

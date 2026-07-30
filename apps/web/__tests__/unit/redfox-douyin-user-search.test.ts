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

  it("falls back to secUid / uid / displayId when accountId is absent", () => {
    const results = mapRedFoxDouyinUserSearchPayload({
      list: [
        {
          secUid: "MS4wLjABAAAA-sec",
          nickname: "只有 secUid 的账号",
          videoCount: 10,
          isVerified: true,
        },
        {
          uid: "uid-123",
          nickname: "只有 uid 的账号",
          fansCount: 5000,
        },
        {
          displayId: "dy-display",
          nickname: "只有 displayId 的账号",
        },
      ],
    })

    expect(results.map((r) => r.accountId)).toEqual([
      "MS4wLjABAAAA-sec",
      "uid-123",
      "dy-display",
    ])
    expect(results[0]).toMatchObject({ videoCount: 10, isVerified: true })
    expect(results[1]).toMatchObject({ followerCount: 5000 })
  })

  it("drops entries that lack both an account id and a nickname", () => {
    const results = mapRedFoxDouyinUserSearchPayload({
      list: [
        { accountId: "ok", nickname: "有昵称" },
        { accountId: "no-nickname" },
        { nickname: "无标识" },
      ],
    })

    expect(results.map((r) => r.accountId)).toEqual(["ok"])
  })
})

describe("extractRedFoxDouyinProfileUrl", () => {
  it("prefers secUid to build the profile URL", () => {
    expect(
      extractRedFoxDouyinProfileUrl({ list: [{ secUid: "MS4wLjABAAAA-test" }] }),
    ).toBe("https://www.douyin.com/user/MS4wLjABAAAA-test")
  })

  it("falls back to authorId when secUid is missing", () => {
    expect(
      extractRedFoxDouyinProfileUrl({ list: [{ authorId: "author-id", accountName: "徐沪生" }] }),
    ).toBe("https://www.douyin.com/user/author-id")
  })

  it("throws when neither secUid nor authorId is present", () => {
    expect(() => extractRedFoxDouyinProfileUrl({ list: [] })).toThrow(
      "红狐暂时无法解析该账号主页，请复制抖音主页链接添加",
    )
    expect(() => extractRedFoxDouyinProfileUrl({ list: [{ accountName: "无名" }] })).toThrow(
      "红狐暂时无法解析该账号主页，请复制抖音主页链接添加",
    )
  })
})

import { describe, expect, it } from "vitest"

import { validateCompetitorUrl } from "@/features/competitor/competitor-url-utils"
import { mapDouyinUserSearchPayload } from "@/lib/tikhub/search-douyin-users"

describe("mapDouyinUserSearchPayload", () => {
  it("maps TikHub V2 results into monitorable Douyin accounts", () => {
    const results = mapDouyinUserSearchPayload({
      user_list: [
        {
          user_id: "MS4wLjABAAAA-test",
          nick_name: "徐沪生-一条创始人",
          avatar_url: "https://example.com/avatar.jpg",
          fans_cnt: 109409,
          publish_cnt: 321,
          second_tag_name: "文化",
        },
        { user_id: "", nick_name: "无账号标识" },
      ],
    })

    expect(results).toEqual([
      {
        secUserId: "MS4wLjABAAAA-test",
        nickname: "徐沪生-一条创始人",
        avatarUrl: "https://example.com/avatar.jpg",
        followerCount: 109409,
        videoCount: 321,
        category: "文化",
      },
    ])
    expect(
      validateCompetitorUrl(`https://www.douyin.com/user/${results[0].secUserId}`),
    ).toEqual({
      ok: true,
      url: "https://www.douyin.com/user/MS4wLjABAAAA-test",
    })
  })
})

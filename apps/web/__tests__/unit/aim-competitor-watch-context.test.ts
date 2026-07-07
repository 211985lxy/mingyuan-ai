import { describe, expect, it } from "vitest"
import { formatWatchAccountsForAim } from "@/lib/aim-competitor-watch-context"

describe("aim competitor watch context", () => {
  it("formats recent watched account videos for positioning chat", () => {
    const block = formatWatchAccountsForAim("双双铜创始人这个对标账号近期12条作品发了什么", [
      {
        nickname: "双双铜创始人",
        platform: "douyin",
        targetUrl: "https://example.com/user",
        refreshStatus: "success",
        lastRefreshedAt: "2026-06-28T00:00:00.000Z",
        latestVideos: [
          {
            videoId: "v1",
            title: "第一条作品",
            coverUrl: "",
            videoUrl: "",
            createTime: 1782604800,
            duration: 30,
            views: 0,
            likes: 12000,
            comments: 34,
            shares: 5,
            collects: 600,
          },
        ],
      },
    ])

    expect(block).toContain("【对标账号监控数据】")
    expect(block).toContain("账号：双双铜创始人（douyin）")
    expect(block).toContain("近期作品（最多 12 条）")
    expect(block).toContain("1. 第一条作品")
    expect(block).toContain("赞1.2万")
    expect(block).toContain("最近一次刷新缓存")
  })

  it("skips unrelated chat", () => {
    expect(formatWatchAccountsForAim("帮我写一条朋友圈", [])).toBe("")
  })
})

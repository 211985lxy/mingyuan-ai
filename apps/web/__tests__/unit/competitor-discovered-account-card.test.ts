import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DiscoveredAccountCard } from "@/components/competitor/discovered-account-card"
import type { SimilarAccount } from "@/lib/api/client"

const account: SimilarAccount = {
  nickname: "测试对标账号",
  avatar: "",
  targetUrl: "https://www.douyin.com/user/test",
  platformUserId: "test",
  followerCount: 12000,
  redfoxScore: 88,
  reason: "同赛道且内容结构相近",
  recentVideos: [{
    title: "最近作品",
    coverUrl: "",
    videoUrl: "https://www.douyin.com/video/1",
    createTime: "2026-07-15T00:00:00.000Z",
    likes: 200,
    comments: 10,
    shares: 3,
    views: 1000,
    interactiveCount: 213,
  }],
}

describe("DiscoveredAccountCard", () => {
  it("renders account evidence and add state", () => {
    const html = renderToStaticMarkup(createElement(DiscoveredAccountCard, {
      account,
      monitored: false,
      canAdd: true,
      adding: false,
      poolFull: false,
      onAdd: () => undefined,
      onIgnore: () => undefined,
    }))
    expect(html).toContain("测试对标账号")
    expect(html).toContain("1.2w 粉丝")
    expect(html).toContain("最近作品")
    expect(html).toContain("加入监控")
  })

  it("renders monitored state", () => {
    const html = renderToStaticMarkup(createElement(DiscoveredAccountCard, {
      account,
      monitored: true,
      canAdd: false,
      adding: false,
      poolFull: false,
      onAdd: () => undefined,
      onIgnore: () => undefined,
    }))
    expect(html).toContain("已监控")
  })
})

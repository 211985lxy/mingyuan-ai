import { describe, expect, it } from "vitest"
import {
  classifyWatchVideo,
  recommendWatchVideos,
  type WatchAccountForRecommendation,
  type WatchVideoForRecommendation,
} from "@/lib/competitor-watch-recommendations"

function video(input: Partial<WatchVideoForRecommendation> & { videoId: string; title: string }): WatchVideoForRecommendation {
  return {
    coverUrl: "",
    createTime: 1783209600,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    collects: 0,
    ...input,
  }
}

function account(input: Partial<WatchAccountForRecommendation>): WatchAccountForRecommendation {
  return {
    id: "a1",
    targetUrl: "https://www.douyin.com/user/test",
    platform: "douyin",
    nickname: "对标账号",
    latestVideos: [],
    viralVideos: [],
    lastRefreshedAt: "2026-07-05T00:00:00.000Z",
    ...input,
  }
}

describe("competitor watch recommendations", () => {
  it("classifies common content patterns", () => {
    expect(classifyWatchVideo("客户成交案例复盘")).toBe("客户案例")
    expect(classifyWatchVideo("客户到底该怎么做")).toBe("问题解答")
    expect(classifyWatchVideo("我的创业经历")).toBe("人设故事")
    expect(classifyWatchVideo("三个方法清单")).toBe("方法清单")
    expect(classifyWatchVideo("这个判断其实错了")).toBe("观点判断")
  })

  it("dedupes videos across viral and latest pools", () => {
    const same = video({ videoId: "v1", title: "客户怎么做选择", likes: 100 })
    const result = recommendWatchVideos({
      accounts: [account({ viralVideos: [same], latestVideos: [same] })],
      now: new Date("2026-07-05T00:00:00.000Z"),
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.videoId).toBe("v1")
  })

  it("prioritizes matching high-engagement videos", () => {
    const result = recommendWatchVideos({
      accounts: [
        account({
          viralVideos: [
            video({ videoId: "weak", title: "普通作品", likes: 10 }),
            video({ videoId: "strong", title: "客户案例复盘", likes: 10000, comments: 100, shares: 50, collects: 300 }),
          ],
        }),
      ],
      categories: ["客户案例"],
      targetText: "客户 成交 案例",
      now: new Date("2026-07-05T00:00:00.000Z"),
    })

    expect(result[0]?.videoId).toBe("strong")
    expect(result[0]?.category).toBe("客户案例")
    expect(result[0]?.migrationAngle).toContain("迁移")
  })
})

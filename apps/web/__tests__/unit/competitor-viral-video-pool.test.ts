import { describe, expect, it } from "vitest"

import { collectAllViralVideos } from "@/components/competitor/competitor-video-sections"
import type { WatchAccount } from "@/lib/api/client"

function account(id: string, scores: number[]): WatchAccount {
  return {
    id,
    targetUrl: `https://example.com/${id}`,
    platform: "douyin",
    platformUserId: id,
    nickname: `账号${id}`,
    avatar: null,
    followerCount: null,
    latestVideos: null,
    viralVideos: scores.map((engagementScore, index) => ({
      videoId: `${id}-${index}`,
      title: `视频${id}-${index}`,
      coverUrl: "",
      createTime: index,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      collects: 0,
      engagementScore,
    })),
    refreshStatus: "success",
    refreshError: null,
    lastRefreshedAt: null,
    createdAt: "2026-07-16T00:00:00.000Z",
  }
}

describe("competitor viral video pool", () => {
  it("collects every monitored account and sorts all viral videos by engagement", () => {
    const videos = collectAllViralVideos([
      account("a", [10, 30]),
      account("b", [20]),
    ])

    expect(videos.map((video) => video.engagementScore)).toEqual([30, 20, 10])
    expect(videos.map((video) => video.account.id)).toEqual(["a", "b", "a"])
  })
})

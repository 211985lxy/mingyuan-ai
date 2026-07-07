import { describe, expect, it } from "vitest"
import { calculateViralVideos } from "@/lib/competitor-watch-viral"
import type { WatchVideoInput } from "@/lib/competitor-watch-viral"

function video(index: number, likes: number): WatchVideoInput {
  return {
    videoId: `v${index}`,
    title: `视频 ${index}`,
    coverUrl: "",
    createTime: index,
    views: 0,
    likes,
    comments: 0,
    shares: 0,
    collects: 0,
  }
}

describe("calculateViralVideos", () => {
  it("keeps the top 20 videos by engagement score", () => {
    const result = calculateViralVideos(
      Array.from({ length: 30 }, (_, index) => video(index + 1, index + 1)),
    )

    expect(result).toHaveLength(20)
    expect(result[0]?.videoId).toBe("v30")
    expect(result[19]?.videoId).toBe("v11")
  })

  it("keeps all videos when there are fewer than 20", () => {
    const result = calculateViralVideos([video(1, 1), video(2, 2), video(3, 3)])

    expect(result.map((item) => item.videoId)).toEqual(["v3", "v2", "v1"])
  })

  it("uses weighted engagement formula: likes + comments*2 + collects*3 + shares*4", () => {
    // v1: likes=10, v2: comments=6 → 10 vs 12, so v2 should rank higher
    const v1: WatchVideoInput = { ...video(1, 10), comments: 0, shares: 0, collects: 0 }
    const v2: WatchVideoInput = { ...video(2, 0), comments: 6, shares: 0, collects: 0 }
    const result = calculateViralVideos([v1, v2])

    expect(result[0]?.videoId).toBe("v2")
    expect(result[0]?.engagementScore).toBe(12)
    expect(result[1]?.engagementScore).toBe(10)
  })

  it("returns empty array for empty input", () => {
    const result = calculateViralVideos([])
    expect(result).toHaveLength(0)
  })
})

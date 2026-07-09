import { describe, expect, it } from "vitest"

import { getWatchVideoPageUrl } from "@/lib/watch-video-url"

describe("getWatchVideoPageUrl", () => {
  it("prefers douyin work pages over media direct links", () => {
    expect(
      getWatchVideoPageUrl({
        platform: "douyin",
        videoId: "123456789",
        videoUrl: "https://aweme.snssdk.com/play/abc",
      }),
    ).toBe("https://www.douyin.com/video/123456789")
  })

  it("falls back to the provided video url for other platforms", () => {
    expect(
      getWatchVideoPageUrl({
        platform: "xiaohongshu",
        videoId: "note-1",
        videoUrl: "https://www.xiaohongshu.com/explore/note-1",
      }),
    ).toBe("https://www.xiaohongshu.com/explore/note-1")
  })
})

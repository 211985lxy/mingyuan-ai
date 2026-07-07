import { describe, expect, it, vi } from "vitest"
import { createWatchVideoExtraction } from "@/lib/competitor-watch-video-extractions"

function dbMock(account: unknown, existing: unknown = null) {
  return {
    watchAccount: {
      findFirst: vi.fn(async () => account),
    },
    videoCopyExtraction: {
      findFirst: vi.fn(async () => existing),
    },
  } as never
}

describe("createWatchVideoExtraction", () => {
  it("rejects empty video links", async () => {
    await expect(
      createWatchVideoExtraction({
        userId: "user_1",
        watchAccountId: "account_1",
        videoUrl: "",
        db: dbMock({ id: "account_1" }),
      }),
    ).rejects.toThrow("请输入视频链接")
  })

  it("rejects watch accounts outside the current user", async () => {
    await expect(
      createWatchVideoExtraction({
        userId: "user_1",
        watchAccountId: "account_2",
        videoUrl: "https://www.douyin.com/video/123",
        db: dbMock(null),
      }),
    ).rejects.toThrow("对标账号不存在或无权限")
  })

  it("reuses an existing extraction for the same user and video url", async () => {
    const existing = { id: "extract_1", sourceUrl: "https://www.douyin.com/video/123" }
    const createExtraction = vi.fn()

    const result = await createWatchVideoExtraction({
      userId: "user_1",
      watchAccountId: "account_1",
      videoUrl: "https://www.douyin.com/video/123",
      db: dbMock({ id: "account_1" }, existing),
      createExtraction,
    })

    expect(result).toBe(existing)
    expect(createExtraction).not.toHaveBeenCalled()
  })
})

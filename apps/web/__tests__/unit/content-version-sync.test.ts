import { describe, expect, it, vi } from "vitest"
import {
  contentFormatToGenerationColumn,
  readAimGenerationContent,
  syncAimGenerationContent,
} from "@/lib/aim/content-version-sync"

describe("contentFormatToGenerationColumn", () => {
  it("maps deliverable formats to AimGeneration columns", () => {
    expect(contentFormatToGenerationColumn("video_script")).toBe("videoScript")
    expect(contentFormatToGenerationColumn("koubo_script")).toBe("videoScript")
    expect(contentFormatToGenerationColumn("wechat_article")).toBe("wechatArticle")
    expect(contentFormatToGenerationColumn("moments_post")).toBe("momentsPost")
    expect(contentFormatToGenerationColumn("community_message")).toBe("communityMessage")
    expect(contentFormatToGenerationColumn("shooting_brief")).toBe("shootingBrief")
    expect(contentFormatToGenerationColumn("raw_copy")).toBe("rawCopy")
  })

  it("returns null for formats without a wide-table column", () => {
    expect(contentFormatToGenerationColumn("xiaohongshu_post")).toBeNull()
    expect(contentFormatToGenerationColumn("unknown_format")).toBeNull()
  })
})

describe("syncAimGenerationContent", () => {
  it("updates the mapped AimGeneration column for the owner", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const tx = { aimGeneration: { updateMany } } as never

    await expect(
      syncAimGenerationContent(tx, {
        userId: "user-1",
        generationId: "gen-1",
        format: "video_script",
        content: "修改后的口播",
      }),
    ).resolves.toEqual({ column: "videoScript" })

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "gen-1", userId: "user-1" },
      data: { videoScript: "修改后的口播" },
    })
  })

  it("skips update when format has no column", async () => {
    const updateMany = vi.fn()
    const tx = { aimGeneration: { updateMany } } as never

    await expect(
      syncAimGenerationContent(tx, {
        userId: "user-1",
        generationId: "gen-1",
        format: "xiaohongshu_post",
        content: "小红书正文",
      }),
    ).resolves.toEqual({ column: null })

    expect(updateMany).not.toHaveBeenCalled()
  })

  it("throws when generation is missing or not owned", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const tx = { aimGeneration: { updateMany } } as never

    await expect(
      syncAimGenerationContent(tx, {
        userId: "user-1",
        generationId: "missing",
        format: "raw_copy",
        content: "草稿",
      }),
    ).rejects.toThrow("GENERATION_NOT_FOUND")
  })
})

describe("readAimGenerationContent", () => {
  it("reads the current generation body for seed versions", async () => {
    const findFirst = vi.fn().mockResolvedValue({ videoScript: "首稿正文" })
    const tx = { aimGeneration: { findFirst } } as never

    await expect(
      readAimGenerationContent(tx, {
        userId: "user-1",
        generationId: "gen-1",
        format: "koubo_script",
      }),
    ).resolves.toBe("首稿正文")

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "gen-1", userId: "user-1" },
      select: { videoScript: true },
    })
  })
})

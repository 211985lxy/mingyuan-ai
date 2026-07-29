import { describe, expect, it, vi } from "vitest"

import {
  buildContentProducerVideoCopyHref,
  completeVideoCopyExtraction,
  resolveContentProducerVideoUrl,
} from "@/lib/aim/video-copy-input"
import type { ApiVideoCopyExtraction } from "@/types/api"

function extraction(overrides: Partial<ApiVideoCopyExtraction> = {}): ApiVideoCopyExtraction {
  return {
    id: "extract-1",
    sourceUrl: "https://v.douyin.com/example/",
    platform: "douyin",
    status: "completed",
    errorMessage: null,
    analysisError: null,
    videoTitle: "测试视频",
    videoCover: null,
    videoDuration: "00:30",
    transcript: "提取后的文案",
    analysisResult: { markdown: "结构化拆解" },
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    completedAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  }
}

describe("AIM content producer video link input", () => {
  it("only lets content_producer intercept supported video links", () => {
    const shareText = "复制打开抖音 https://v.douyin.com/example/ 看看这个视频"
    expect(resolveContentProducerVideoUrl("content_producer", shareText)).toBe("https://v.douyin.com/example/")
    expect(resolveContentProducerVideoUrl("content_review", shareText)).toBeNull()
    expect(resolveContentProducerVideoUrl("content_producer", "参考资料 https://example.com/article")).toBeNull()
  })

  it("keeps project scope when opening the extracted benchmark", () => {
    expect(buildContentProducerVideoCopyHref({ recordId: "extract-1", projectId: "project-1" }))
      .toBe("/aim?agent=content_producer&videoCopyExtractionId=extract-1&projectId=project-1")
    expect(buildContentProducerVideoCopyHref({ recordId: "extract-1" }))
      .toBe("/aim?agent=content_producer&videoCopyExtractionId=extract-1&mode=quick")
  })

  it("polls the existing extraction until transcript and analysis are ready", async () => {
    const create = vi.fn().mockResolvedValue(extraction({ status: "extracting", transcript: null }))
    const sync = vi.fn().mockResolvedValue(extraction())
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(completeVideoCopyExtraction("https://v.douyin.com/example/", {
      create,
      sync,
      wait,
    })).resolves.toMatchObject({ status: "completed", transcript: "提取后的文案" })
    expect(create).toHaveBeenCalledWith("https://v.douyin.com/example/")
    expect(sync).toHaveBeenCalledWith("extract-1")
    expect(wait).toHaveBeenCalledWith(2500)
  })

  it("returns the provider error and stops after the polling limit", async () => {
    await expect(completeVideoCopyExtraction("https://v.douyin.com/example/", {
      create: vi.fn().mockResolvedValue(extraction({
        status: "failed",
        transcript: null,
        errorMessage: "该视频无法提取",
      })),
      sync: vi.fn(),
      wait: vi.fn(),
    })).rejects.toThrow("该视频无法提取")

    await expect(completeVideoCopyExtraction("https://v.douyin.com/example/", {
      create: vi.fn().mockResolvedValue(extraction({ status: "extracting", transcript: null })),
      sync: vi.fn().mockResolvedValue(extraction({ status: "extracting", transcript: null })),
      wait: vi.fn().mockResolvedValue(undefined),
      maxSyncAttempts: 1,
    })).rejects.toThrow("视频仍在提取中")
  })
})

import { describe, expect, it, vi } from "vitest"

const {
  submitVideoTextExtractionTask,
  fetchVideoTextExtractionResult,
  assertVideoTextProviderReady,
} = vi.hoisted(() => ({
  submitVideoTextExtractionTask: vi.fn().mockResolvedValue({ batchId: "batch-1" }),
  fetchVideoTextExtractionResult: vi.fn().mockResolvedValue({
    status: "completed",
    title: "测试视频",
    transcript: "测试转录",
  }),
  assertVideoTextProviderReady: vi.fn(() => {
    throw new Error("视频号文案提取服务尚未完成真实联调")
  }),
}))

vi.mock("@/lib/video-text-extractor", () => ({
  assertVideoTextProviderReady,
  fetchVideoTextExtractionResult,
  submitVideoTextExtractionTask,
}))

import { getVideoTextProvider, qingdouProvider } from "@/lib/video-text-providers"

describe("video text provider registry", () => {
  it("routes supported non-channels platforms to the existing qingdou boundary", async () => {
    const provider = getVideoTextProvider("douyin")

    expect(provider).toBe(qingdouProvider)
    await expect(provider.submitTask("https://www.douyin.com/video/7000000000000000000")).resolves.toEqual({ batchId: "batch-1" })
    await expect(provider.fetchResult("batch-1")).resolves.toMatchObject({ status: "completed", transcript: "测试转录" })
    expect(submitVideoTextExtractionTask).toHaveBeenCalledWith("https://www.douyin.com/video/7000000000000000000")
    expect(fetchVideoTextExtractionResult).toHaveBeenCalledWith("batch-1")
  })

  it("keeps the unverified channels provider explicitly unavailable", async () => {
    const provider = getVideoTextProvider("channels")

    await expect(provider.submitTask("https://channels.weixin.qq.com/demo")).rejects.toThrow("视频号文案提取服务尚未完成真实联调")
  })
})

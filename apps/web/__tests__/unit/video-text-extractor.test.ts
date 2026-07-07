import { describe, expect, it } from "vitest"

import {
  VIDEO_TEXT_EXTRACT_USER_AGENT,
  assertSupportedVideoUrl,
  detectVideoPlatform,
  formatVideoTextExtractionError,
  parseVideoTextSubmitResult,
  parseVideoTextTaskResult,
} from "@/lib/video-text-extractor"

describe("video text extractor", () => {
  it("accepts Douyin, Bilibili, and generic video URLs", () => {
    expect(() => assertSupportedVideoUrl("https://v.douyin.com/example/")).not.toThrow()
    expect(() => assertSupportedVideoUrl("https://www.bilibili.com/video/BV1234567890")).not.toThrow()
    expect(() => assertSupportedVideoUrl("https://example.com/watch/123")).not.toThrow()

    expect(detectVideoPlatform("https://v.douyin.com/example/")).toBe("douyin")
    expect(detectVideoPlatform("https://www.bilibili.com/video/BV1234567890")).toBe("bilibili")
    expect(detectVideoPlatform("https://example.com/watch/123")).toBe("unknown")
  })

  it("extracts the first URL from pasted share text", () => {
    expect(
      assertSupportedVideoUrl("4.64 复制打开抖音，看看这个视频 https://v.douyin.com/example/ 更多内容")
    ).toBe("https://v.douyin.com/example/")
    expect(
      assertSupportedVideoUrl("B站视频： https://www.bilibili.com/video/BV1234567890?spm_id_from=333.337")
    ).toBe("https://www.bilibili.com/video/BV1234567890?spm_id_from=333.337")
  })

  it("rejects empty or invalid URLs", () => {
    expect(() => assertSupportedVideoUrl("")).toThrow("请输入视频链接")
    expect(() => assertSupportedVideoUrl("not-a-link")).toThrow("请输入正确的视频链接")
    expect(() => assertSupportedVideoUrl("http://localhost:3002/video-copy")).toThrow("请粘贴公开视频链接")
    expect(() => assertSupportedVideoUrl("http://127.0.0.1:3002/video-copy")).toThrow("请粘贴公开视频链接")
    expect(() => assertSupportedVideoUrl("https://v3-search.douyinvod.com/example/video/tos/cn/file.mp4")).toThrow(
      "请粘贴抖音分享页或作品页链接"
    )
  })

  it("maps provider failures to user-facing Chinese messages", () => {
    expect(formatVideoTextExtractionError(new Error("1004 apikey error"))).toBe(
      "文案提取服务配置有问题，请检查服务端密钥。"
    )
    expect(formatVideoTextExtractionError(new Error("insufficient balance"))).toBe(
      "文案提取额度不足，请先补充额度后再试。"
    )
    expect(formatVideoTextExtractionError(new Error("timeout"))).toBe(
      "文案提取服务暂时不可用，请稍后重试。"
    )
  })

  it("parses pending, completed, and failed task results", () => {
    expect(parseVideoTextSubmitResult({ result: 686 })).toEqual({ batchId: "686" })
    expect(parseVideoTextSubmitResult({ result: { batchId: "batch-1" } })).toEqual({ batchId: "batch-1" })

    expect(parseVideoTextTaskResult({ result: { batchStatus: 1 } })).toEqual({
      status: "extracting",
    })

    expect(
      parseVideoTextTaskResult({
        result: {
          batchStatus: 2,
          list: [
            {
              status: 1000,
              originLink: "https://www.bilibili.com/video/BV1234567890",
              platformName: "bilibili",
              videoTitle: "标题",
              videoCover: "https://example.com/cover.jpg",
              videoTime: "01:23",
              videoContent: "这是提取出来的视频文案。",
            },
          ],
        },
      })
    ).toMatchObject({
      status: "completed",
      platform: "bilibili",
      title: "标题",
      transcript: "这是提取出来的视频文案。",
    })

    expect(
      parseVideoTextTaskResult({
        result: {
          batchStatus: 2,
          list: [{ status: 1006, msg: "video too large" }],
        },
      })
    ).toEqual({
      status: "failed",
      errorMessage: "该视频暂时无法提取文案，请换一个链接试试。",
    })
  })

  it("uses a browser User-Agent without exposing provider branding", () => {
    expect(VIDEO_TEXT_EXTRACT_USER_AGENT).toContain("Mozilla/5.0")
    expect(VIDEO_TEXT_EXTRACT_USER_AGENT).not.toMatch(/qingdou|轻抖|青斗/i)
  })
})

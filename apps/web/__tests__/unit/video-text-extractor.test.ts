import { describe, expect, it } from "vitest"

import {
  VIDEO_TEXT_EXTRACT_USER_AGENT,
  assertSupportedVideoUrl,
  detectVideoPlatform,
  extractPureVideoUrl,
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

  it("detects WeChat Channels URLs as channels", () => {
    expect(detectVideoPlatform("https://channels.weixin.qq.com/platform/post/list")).toBe("channels")
    expect(detectVideoPlatform("https://weixin110.qq.com/abc123")).toBe("channels")
    expect(detectVideoPlatform("https://sph.weixin.qq.com/xyz")).toBe("channels")
    expect(detectVideoPlatform("https://weixin.qq.com/")).toBe("channels")
  })

  it("detects channels from dirty WeChat share text", () => {
    expect(
      detectVideoPlatform("太精彩了！点击链接观看完整视频 #视频号 https://channels.weixin.qq.com/abc 复制整段文字")
    ).toBe("channels")
    expect(
      detectVideoPlatform("3.87 复制这段内容，打开微信看看吧 https://weixin110.qq.com/xyz789 。")
    ).toBe("channels")
  })

  it("extracts pure URLs from dirty share text", () => {
    expect(extractPureVideoUrl("看看这个 https://v.douyin.com/example/ 更多内容")).toBe(
      "https://v.douyin.com/example/"
    )
    expect(extractPureVideoUrl("文案 https://weixin110.qq.com/xyz789中文尾巴")).toBe(
      "https://weixin110.qq.com/xyz789"
    )
    expect(extractPureVideoUrl("没有链接的文本")).toBe("没有链接的文本")
  })

  it("assertSupportedVideoUrl accepts WeChat share text containing a channels link", () => {
    expect(
      assertSupportedVideoUrl("太精彩了！点击链接观看 #视频号 https://channels.weixin.qq.com/abc 复制整段文字")
    ).toBe("https://channels.weixin.qq.com/abc")
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

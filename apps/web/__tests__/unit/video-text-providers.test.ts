import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatVideoTextExtractionError } from "@/lib/video-text-extractor"
import {
  channelsProvider,
  getVideoTextProvider,
  qingdouProvider,
} from "@/lib/video-text-providers"

describe("video text providers", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.CHANNELS_EXTRACT_API_URL
    delete process.env.CHANNELS_EXTRACT_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it("routes platforms to the right provider", () => {
    expect(getVideoTextProvider("channels")).toBe(channelsProvider)
    expect(getVideoTextProvider("douyin")).toBe(qingdouProvider)
    expect(getVideoTextProvider("bilibili")).toBe(qingdouProvider)
    expect(getVideoTextProvider("kuaishou")).toBe(qingdouProvider)
    expect(getVideoTextProvider("xiaohongshu")).toBe(qingdouProvider)
    expect(getVideoTextProvider("unknown")).toBe(qingdouProvider)
  })

  it("channels provider throws a user-friendly error when not configured", async () => {
    await expect(channelsProvider.submitTask("https://channels.weixin.qq.com/abc")).rejects.toThrow(
      "视频号文案提取服务未配置，请联系管理员配置 CHANNELS_EXTRACT_API_URL 和 CHANNELS_EXTRACT_API_KEY"
    )
    await expect(channelsProvider.fetchResult("batch-1")).rejects.toThrow(
      "视频号文案提取服务未配置"
    )
  })

  it("keeps the not-configured message visible to end users", () => {
    expect(
      formatVideoTextExtractionError(
        new Error("视频号文案提取服务未配置，请联系管理员配置 CHANNELS_EXTRACT_API_URL 和 CHANNELS_EXTRACT_API_KEY")
      )
    ).toBe("视频号文案提取服务未配置，请联系管理员配置 CHANNELS_EXTRACT_API_URL 和 CHANNELS_EXTRACT_API_KEY")
  })

  it("channels provider submits tasks with qingdou-like protocol when configured", async () => {
    process.env.CHANNELS_EXTRACT_API_URL = "https://channels-provider.example.com/"
    process.env.CHANNELS_EXTRACT_API_KEY = "test-key"

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: 686 }), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)

    const task = await channelsProvider.submitTask("https://channels.weixin.qq.com/abc")
    expect(task).toEqual({ batchId: "686" })

    const [requestUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe("https://channels-provider.example.com/web/api/commitGetTextTask")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key")
    expect(JSON.parse(init.body as string)).toEqual({
      userInputList: [{ numberIndex: 0, url: "https://channels.weixin.qq.com/abc" }],
    })
  })

  it("channels provider polls results and parses completed transcripts", async () => {
    process.env.CHANNELS_EXTRACT_API_URL = "https://channels-provider.example.com"
    process.env.CHANNELS_EXTRACT_API_KEY = "test-key"

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            batchStatus: 2,
            list: [
              {
                status: 1000,
                originLink: "https://channels.weixin.qq.com/abc",
                videoTitle: "视频号标题",
                videoContent: "视频号提取文案。",
              },
            ],
          },
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await channelsProvider.fetchResult("batch-1")
    expect(result.status).toBe("completed")
    expect(result.platform).toBe("channels")
    expect(result.transcript).toBe("视频号提取文案。")

    const [requestUrl] = fetchMock.mock.calls[0] as [URL]
    expect(String(requestUrl)).toBe(
      "https://channels-provider.example.com/web/api/getTaskResult?batchId=batch-1"
    )
  })
})

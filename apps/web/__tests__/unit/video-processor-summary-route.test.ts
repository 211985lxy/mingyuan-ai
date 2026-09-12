/**
 * 5b 摘要必须走共享模型路由链，不得再直连 LLM_SUMMARY_*。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAgentLLM, complete, readContentStoreConfig } = vi.hoisted(() => ({
  complete: vi.fn(),
  getAgentLLM: vi.fn(),
  readContentStoreConfig: vi.fn(),
}))

vi.mock("@/lib/llm/agent-router", () => ({ getAgentLLM }))

vi.mock("@/lib/content-pipeline/lark-content-store", () => ({
  createPendingContentItem: vi.fn(),
  upsertContentItem: vi.fn(),
  readContentStoreConfig,
}))

vi.mock("@/lib/video-text-extractor", () => ({
  assertSupportedVideoUrl: (url: string) => url,
  detectVideoPlatform: () => "douyin",
  formatVideoTextExtractionError: (e: unknown) => String(e),
}))

vi.mock("@/lib/video-text-providers", () => ({
  getVideoTextProvider: () => ({
    submitTask: async () => ({ batchId: "batch-1" }),
    fetchResult: async () => ({
      status: "completed",
      title: "对标视频标题",
      transcript: "完整转录文本，用来生成摘要。",
      coverUrl: "https://example.com/c.jpg",
      duration: "60",
    }),
  }),
}))

vi.mock("@/lib/transcript-polish", () => ({ polishTranscript: async (t: string) => t }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { processVideo } from "@/lib/content-pipeline/video-processor"

describe("processVideo 5b 摘要走共享路由链", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readContentStoreConfig.mockImplementation(() => {
      throw new Error("缺少 LARK_CONTENT_BASE_TOKEN")
    })
    getAgentLLM.mockReturnValue({ complete })
    complete.mockResolvedValue({
      content: JSON.stringify({
        title: "路由链摘要标题",
        summary: "这是共享路由生成的摘要。",
        key_points: ["要点一", "要点二"],
      }),
      model: "deepseek-v4-flash",
      provider: "deepseek",
    })
    delete process.env.LLM_SUMMARY_API_KEY
  })

  it("未配 LLM_SUMMARY_API_KEY 时仍能生成摘要，且调用 business_diagnosis 路由", async () => {
    const result = await processVideo({
      videoUrl: "https://www.douyin.com/video/7000000000000000000",
      source: "unit-test",
      skipTopicExtraction: true,
      skipCompetitorCheck: true,
      skipCopyInspiration: true,
    })

    expect(result.success).toBe(true)
    expect(getAgentLLM).toHaveBeenCalledWith("business_diagnosis")
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 8192,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user", content: expect.stringContaining("完整转录文本") }),
        ]),
      }),
    )
    expect(result.aiSummary).toEqual({
      title: "路由链摘要标题",
      summary: "这是共享路由生成的摘要。",
      keyPoints: ["要点一", "要点二"],
    })
  })
})

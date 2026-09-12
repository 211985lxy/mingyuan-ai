/**
 * video-processor — 飞书内容素材库可选降级测试。
 *
 * 验证要点：
 *   1. 未配置 LARK_CONTENT_*（readContentStoreConfig 抛错）时，流水线不因飞书失败而中断：
 *      跳过占位/回写，仍返回 success:true，recordId 为空。
 *   2. 显式传入 storeConfig（测试/内部通道）时优先使用，不读环境变量，正常写飞书。
 *   3. 环境变量配置齐全时行为不变（占位 + 回写都发生）。
 *
 * 使用 skipAiProcessing 走 5a-only 路径，避免 5b-5e 的 LLM/DB 依赖。
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

const { createPendingContentItem, upsertContentItem, readContentStoreConfig } = vi.hoisted(() => ({
  createPendingContentItem: vi.fn(async () => ({ ok: true, recordId: "rec-1" })),
  upsertContentItem: vi.fn(async () => ({ ok: true, recordId: "rec-1" })),
  readContentStoreConfig: vi.fn(),
}))

vi.mock("@/lib/content-pipeline/lark-content-store", () => ({
  createPendingContentItem,
  upsertContentItem,
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
      transcript: "完整转录文本",
      coverUrl: "https://example.com/c.jpg",
      duration: "60",
    }),
  }),
}))

vi.mock("@/lib/transcript-polish", () => ({ polishTranscript: async (t: string) => t }))

// topic-bridge / competitor-bridge 顶层引用 prisma；skipAiProcessing 路径不会触发查询，
// mock 掉避免单元测试构造真实 PrismaClient。
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { processVideo } from "@/lib/content-pipeline/video-processor"

const STORE_CONFIG = { baseToken: "bt", tableId: "tt" }

describe("processVideo 飞书内容素材库可选降级", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("未配置飞书 token/table 时流水线仍成功，且不调用任何飞书写入", async () => {
    readContentStoreConfig.mockImplementation(() => {
      throw new Error("缺少 LARK_CONTENT_BASE_TOKEN")
    })

    const result = await processVideo({
      videoUrl: "https://www.douyin.com/video/7000000000000000000",
      source: "unit-test",
      skipAiProcessing: true,
    })

    expect(result.success).toBe(true)
    expect(result.recordId).toBeUndefined()
    expect(result.extraction?.transcript).toBe("完整转录文本")
    expect(createPendingContentItem).not.toHaveBeenCalled()
    expect(upsertContentItem).not.toHaveBeenCalled()
  })

  it("显式传入 storeConfig 时优先使用，不读环境变量，正常写飞书", async () => {
    const result = await processVideo({
      videoUrl: "https://www.douyin.com/video/7000000000000000000",
      source: "unit-test",
      skipAiProcessing: true,
      storeConfig: STORE_CONFIG,
    })

    expect(result.success).toBe(true)
    expect(result.recordId).toBe("rec-1")
    expect(readContentStoreConfig).not.toHaveBeenCalled()
    expect(createPendingContentItem).toHaveBeenCalledTimes(1)
    expect(createPendingContentItem).toHaveBeenCalledWith(
      "https://www.douyin.com/video/7000000000000000000",
      "unit-test",
      STORE_CONFIG,
    )
    expect(upsertContentItem).toHaveBeenCalledTimes(1)
    expect(upsertContentItem).toHaveBeenCalledWith(expect.objectContaining({ 处理状态: "已完成" }), STORE_CONFIG)
  })

  it("环境变量配置齐全时走正常链路（占位 + 回写）", async () => {
    readContentStoreConfig.mockReturnValue(STORE_CONFIG)

    const result = await processVideo({
      videoUrl: "https://www.douyin.com/video/7000000000000000000",
      source: "unit-test",
      skipAiProcessing: true,
    })

    expect(result.success).toBe(true)
    expect(result.recordId).toBe("rec-1")
    expect(readContentStoreConfig).toHaveBeenCalledTimes(1)
    expect(createPendingContentItem).toHaveBeenCalledTimes(1)
    expect(upsertContentItem).toHaveBeenCalledTimes(1)
  })
})

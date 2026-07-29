import { describe, expect, it } from "vitest"

import { parseGenerateBody, validateGenerateInput } from "@/lib/aim-generate-validate"
import { parseAimChatBody } from "@/lib/aim/services/chat/request"
import { resolveAimHistoryAgentModule } from "@/hooks/use-aim-route-sync"

describe("AIM copy-studio request normalization", () => {
  it("uses writerModule as the compatible alias for both generate fields", () => {
    expect(parseGenerateBody({ rawInput: "写一篇长文", writerModule: "longform" })).toMatchObject({
      agentModule: "longform", writerModule: "longform",
    })
  })

  it("normalizes chat aliases before the execution boundary", () => {
    expect(parseAimChatBody({ agentId: "content_producer", writerModule: "social", messages: [{ role: "user", content: "写一版" }] }))
      .toMatchObject({ ok: true, agentModule: "social", writerModule: "social" })
  })

  it("keeps server rejection for a module on a non-creator agent", () => {
    const parsed = parseGenerateBody({ agentId: "business_diagnosis", rawInput: "做诊断", targetFormats: ["raw_copy"], agentModule: "social" })
    expect(validateGenerateInput(parsed)).toBe("agentModule 只能用于内容创作官")
  })

  it("rejects video extraction context on agents without capability", () => {
    const review = parseGenerateBody({
      agentId: "content_review",
      rawInput: "质检这段",
      targetFormats: ["raw_copy"],
      videoCopyExtractionId: "vce_test_1",
    })
    expect(validateGenerateInput(review)).toBe("当前专家未授权视频文案提取")

    const producer = parseGenerateBody({
      agentId: "content_producer",
      rawInput: "基于视频写稿",
      targetFormats: ["raw_copy"],
      videoCopyExtractionId: "vce_test_1",
    })
    expect(validateGenerateInput(producer)).toBeNull()
  })

  it("restores a persisted mode only for content-producer history", () => {
    const taskSpec = { execution: { schemaVersion: 1, copyStudioModule: "free" } } as never
    expect(resolveAimHistoryAgentModule("content_producer", taskSpec)).toBe("free")
    expect(resolveAimHistoryAgentModule("business_diagnosis", taskSpec)).toBeUndefined()
  })
})

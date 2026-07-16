import { describe, expect, it } from "vitest"

import { getContentPreview, getContentTitle } from "@/lib/home-history-summary"
import type { AimGeneration } from "@/lib/api/client"

function generation(rawInput: string, topicTitle: string | null = null): AimGeneration {
  return {
    id: "generation-1",
    rawInput,
    topicTitle,
    videoScript: null,
    wechatArticle: null,
    momentsPost: null,
    communityMessage: null,
    shootingBrief: null,
    rawCopy: null,
    formatsRequested: [],
    knowledgeUsed: [],
    createdAt: "2026-07-14T00:00:00.000Z",
  }
}

describe("home AIM history summary", () => {
  it("renders a bounded preview without internal markers or raw URLs", () => {
    const item = generation(
      `【本轮对话】\n用户：请生成会议纪要 ${"内容".repeat(100)} https://example.com/private`,
    )

    const preview = getContentPreview(item)

    expect(preview.length).toBeLessThanOrEqual(121)
    expect(preview).not.toContain("【本轮对话】")
    expect(preview).not.toContain("【本次生成输入】")
    expect(preview).not.toContain("https://")
  })

  it("bounds long topic titles before rendering them", () => {
    expect(getContentTitle(generation("输入", "标题".repeat(40))).length).toBeLessThanOrEqual(43)
  })
})

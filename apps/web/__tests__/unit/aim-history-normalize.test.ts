import { describe, expect, it } from "vitest"

import { splitGenerationReasoning } from "@/lib/aim-generation-text"
import { normalizeAimGenerationForRead } from "@/lib/aim/history-normalize"

const STORED_WITH_NOTE = `[[AIM_METHOD_NOTE]]
### 目标判定
- businessGoal=lead（显式词）
### 来源标注
- 对标爆款视频来源：未提供/待补充
[[/AIM_METHOD_NOTE]]

这是可直接发布的正文第一段。

这是正文第二段。`

describe("splitGenerationReasoning（读取时思考/正文分离）", () => {
  it("splits a stored generation into publishable body and reasoning summary", () => {
    const parsed = splitGenerationReasoning(STORED_WITH_NOTE)
    expect(parsed.content).toContain("正文第一段")
    expect(parsed.content).not.toContain("AIM_METHOD_NOTE")
    expect(parsed.content).not.toContain("目标判定")
    expect(parsed.reasoningSummary).toContain("目标判定")
    expect(parsed.content.length).toBeLessThan(STORED_WITH_NOTE.length)
  })

  it("is idempotent for clean content without the marker", () => {
    const parsed = splitGenerationReasoning("干净的正文。")
    expect(parsed.content).toBe("干净的正文。")
    expect(parsed.reasoningSummary).toBeUndefined()
  })
})

describe("normalizeAimGenerationForRead（历史读取归一化）", () => {
  it("strips METHOD_NOTE from content columns and exposes reasoningByFormat", () => {
    const normalized = normalizeAimGenerationForRead({
      id: "gen-1",
      videoScript: STORED_WITH_NOTE,
      wechatArticle: null,
      momentsPost: null,
      communityMessage: null,
      shootingBrief: null,
      rawCopy: "无标记的原始文案。",
    })
    expect(normalized.videoScript).not.toContain("AIM_METHOD_NOTE")
    expect(normalized.videoScript).toContain("正文第一段")
    expect(normalized.rawCopy).toBe("无标记的原始文案。")
    expect(normalized.reasoningByFormat.video_script).toContain("目标判定")
    expect(normalized.reasoningByFormat.raw_copy).toBeUndefined()
  })

  it("keeps rows without the marker untouched", () => {
    const normalized = normalizeAimGenerationForRead({
      videoScript: "普通口播正文。",
      wechatArticle: null,
      momentsPost: null,
      communityMessage: null,
      shootingBrief: null,
      rawCopy: null,
    })
    expect(normalized.videoScript).toBe("普通口播正文。")
    expect(normalized.reasoningByFormat).toEqual({})
  })
})

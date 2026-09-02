import { describe, expect, it } from "vitest"

import {
  AIM_IMITATE_REWRITE_SKILL_PROMPT,
  buildAimImitateRewritePrompt,
  hasAimImitateRewriteIntent,
} from "@/lib/aim-imitate-rewrite"

describe("aim imitate rewrite helper", () => {
  it("marks the formal imitate route and keeps the fixed output contract", () => {
    const prompt = buildAimImitateRewritePrompt({
      sourceOriginalText: "原文里先抛判断，再讲冲突，最后落到行动。",
      sourceAnalysisText: "结构化拆解：故事型 + 自我否定型。",
      currentDraft: "我当前先写了一版行业方向。",
      requestText: "故事性仿写",
    })

    expect(prompt).toContain("[[AIM_IMITATE_REWRITE]]")
    expect(prompt).toContain("专业爆款结构库")
    expect(prompt).toContain("IP操盘方法论")
    expect(prompt).toContain("## 仿写优化提示")
    expect(prompt).toContain("## 仿写成稿")
    expect(prompt).toContain("旧认知/旧做法")
    expect(prompt).toContain("起点 -> 冲突 -> 反转 -> 输出")
    // 版本数量只服从用户指令；本例点名"故事性仿写"，不得默认翻倍成双版本
    expect(prompt).toContain("不默认翻倍成双版本")
  })

  it("detects formal imitate rewrite intent from marker and plain phrases", () => {
    expect(hasAimImitateRewriteIntent("[[AIM_IMITATE_REWRITE]]\n请正式仿写")).toBe(true)
    expect(hasAimImitateRewriteIntent("仿写这条")).toBe(true)
    expect(hasAimImitateRewriteIntent("故事性仿写")).toBe(true)
    expect(hasAimImitateRewriteIntent("帮我改得更口语化")).toBe(false)
  })

  it("keeps the visible skill prompt aligned with the formal route", () => {
    expect(AIM_IMITATE_REWRITE_SKILL_PROMPT).toContain("爆款结构")
    expect(AIM_IMITATE_REWRITE_SKILL_PROMPT).toContain("版本数量服从用户指令")
    expect(AIM_IMITATE_REWRITE_SKILL_PROMPT).toContain("不默认翻倍成双版本")
  })
})

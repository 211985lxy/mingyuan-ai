import { describe, expect, it } from "vitest"

import { compressAimMessages } from "@/lib/aim-context-compressor"

describe("compressAimMessages deliverable preservation", () => {
  it("keeps expanded 成稿正文 excerpt in older-turn summary instead of stub only", () => {
    const body = "养了一个内容团队，配了策划文案拍摄剪辑，月底却算不出获客。"
    const messages = [
      { role: "user" as const, content: "写一口播" },
      {
        role: "assistant" as const,
        content: `内容创作官 · 单篇创作 交付物已生成。\n\n【口播文案正文】\n${body}`,
      },
      { role: "user" as const, content: "再写一版朋友圈" },
      { role: "assistant" as const, content: "朋友圈已生成。" },
      { role: "user" as const, content: "再改标题" },
      { role: "assistant" as const, content: "标题候选如下。" },
      { role: "user" as const, content: "换个钩子" },
      { role: "assistant" as const, content: "新钩子如下。" },
      { role: "user" as const, content: "再顺一下结尾" },
      { role: "assistant" as const, content: "结尾已润色。" },
      { role: "user" as const, content: "这个文案结构是什么" },
      { role: "assistant" as const, content: "结构拆解如下。" },
    ]

    const compressed = compressAimMessages("content_producer", messages)
    expect(compressed.didCompress).toBe(true)
    expect(compressed.summary).toContain("养了一个内容团队")
    expect(compressed.summary).toContain("AI成稿：")
  })
})

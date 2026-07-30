import { describe, expect, it } from "vitest"

import {
  AIM_CONTEXT_CAPACITY_TOKENS,
  estimateContextTokens,
  estimateContextUsageBreakdown,
  estimateTokensFromContent,
  estimateTokensFromText,
  FIXED_PROMPT_BUFFER_TOKENS,
  formatChineseTokenCount,
  formatContextCapacityLabel,
} from "@/lib/aim-context-usage"

describe("aim-context-usage", () => {
  it("按中英混合文本估算 token", () => {
    expect(estimateTokensFromText("李相宇 AI 商业顾问")).toBeGreaterThanOrEqual(7)
    expect(estimateTokensFromText("OpenAI GPT-5.6 context window")).toBeGreaterThanOrEqual(7)
  })

  it("图片内容按固定预算估算", () => {
    expect(estimateTokensFromContent([
      { type: "text", text: "请分析这张图" },
      { type: "image_url", image_url: { url: "https://example.com/a.png" } },
    ])).toBeGreaterThan(1000)
  })

  it("合并消息与上下文块的估算", () => {
    const used = estimateContextTokens({
      messages: [
        { content: "请帮我改开头" },
        { content: "这是当前文案正文" },
      ],
      blocks: ["历史记忆：用户偏好短句口播", "知识库：老板做 AI 创业，不讲 AI coding"],
      fixedPromptBuffer: 200,
    })

    expect(used).toBeGreaterThan(200)
  })

  it("按来源拆分背景信息占用，空对话只剩系统预留", () => {
    const breakdown = estimateContextUsageBreakdown({})
    expect(breakdown.usedTokens).toBe(FIXED_PROMPT_BUFFER_TOKENS)
    expect(breakdown.segments.find((s) => s.id === "system_reserve")?.tokens).toBe(FIXED_PROMPT_BUFFER_TOKENS)
    expect(breakdown.segments.filter((s) => s.id !== "system_reserve").every((s) => s.tokens === 0)).toBe(true)
  })

  it("粘贴长文会抬高粘贴素材分段，且总量与旧估算对齐", () => {
    const pasted = "老板口述：" + "短句口播，少形容词。".repeat(40)
    const breakdown = estimateContextUsageBreakdown({
      conversation: [{ content: "先看这段" }],
      currentInput: "帮我改成口播",
      pastedCopy: pasted,
    })

    const pastedSegment = breakdown.segments.find((s) => s.id === "pasted_copy")
    expect(pastedSegment?.tokens).toBeGreaterThan(200)
    expect(pastedSegment!.tokens).toBeGreaterThan(
      breakdown.segments.find((s) => s.id === "current_input")!.tokens,
    )

    const legacy = estimateContextTokens({
      messages: [
        { content: "先看这段" },
        { content: "帮我改成口播" },
        { content: pasted },
      ],
    })
    expect(breakdown.usedTokens).toBe(legacy)
  })

  it("图片单独计入图片分段", () => {
    const breakdown = estimateContextUsageBreakdown({
      conversation: [{ content: "看图", imageCount: 2 }],
    })
    expect(breakdown.segments.find((s) => s.id === "images")?.tokens).toBe(2400)
    expect(breakdown.segments.find((s) => s.id === "conversation")?.tokens).toBeGreaterThan(0)
  })

  it("按中文习惯格式化数字与容量标签", () => {
    expect(formatChineseTokenCount(37_000)).toBe("3.7万")
    expect(formatChineseTokenCount(AIM_CONTEXT_CAPACITY_TOKENS)).toBe("20万")
    expect(formatContextCapacityLabel(37_000, AIM_CONTEXT_CAPACITY_TOKENS)).toBe("3.7万 / 20万 (18.5%)")
  })
})

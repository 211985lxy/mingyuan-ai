import { describe, expect, it } from "vitest"

import {
  AIM_CONTEXT_CAPACITY_TOKENS,
  estimateContextTokens,
  estimateTokensFromContent,
  estimateTokensFromText,
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

  it("按中文习惯格式化数字与容量标签", () => {
    expect(formatChineseTokenCount(37_000)).toBe("3.7万")
    expect(formatChineseTokenCount(AIM_CONTEXT_CAPACITY_TOKENS)).toBe("20万")
    expect(formatContextCapacityLabel(37_000, AIM_CONTEXT_CAPACITY_TOKENS)).toBe("3.7万 / 20万 (18.5%)")
  })
})

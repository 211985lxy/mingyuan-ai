import { describe, expect, it } from "vitest"

import { extractAssistantText } from "@/lib/llm/provider"

describe("extractAssistantText", () => {
  it("prefers content when present", () => {
    expect(
      extractAssistantText({ content: "  成稿正文  ", reasoning_content: "思考过程" }),
    ).toBe("成稿正文")
  })

  it("falls back to reasoning_content when content is empty", () => {
    expect(
      extractAssistantText({ content: "", reasoning_content: "  只剩推理里的话  " }),
    ).toBe("只剩推理里的话")
  })

  it("returns empty string when both are missing", () => {
    expect(extractAssistantText({ content: "   " })).toBe("")
    expect(extractAssistantText(null)).toBe("")
  })
})

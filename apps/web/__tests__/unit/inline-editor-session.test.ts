import { describe, expect, it } from "vitest"
import {
  buildInlineSelectionPrompt,
  hashInlineContent,
  sessionKey,
} from "@/lib/aim/inline-editor-session"

describe("inline-editor-session helpers", () => {
  it("builds stable content hashes for stale-selection detection", () => {
    expect(hashInlineContent("abc")).toBe(hashInlineContent("abc"))
    expect(hashInlineContent("abc")).not.toBe(hashInlineContent("abcd"))
  })

  it("builds selection rewrite prompts with replacement instructions", () => {
    const prompt = buildInlineSelectionPrompt("polish", "今天天气真好")
    expect(prompt).toContain("更顺")
    expect(prompt).toContain("替换稿")
    expect(prompt).toContain("今天天气真好")
  })

  it("builds session keys from message and format", () => {
    expect(sessionKey("m1", "video_script")).toBe("m1:video_script")
  })
})

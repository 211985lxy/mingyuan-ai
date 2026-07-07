import { describe, expect, it } from "vitest"

import { buildImageGeneratePrompt, normalizeImageGenerateKind } from "@/lib/image-generate-prompt"

describe("image generate prompt", () => {
  it("keeps raw prompts unchanged", () => {
    expect(buildImageGeneratePrompt({ prompt: "星际列车", kind: "raw" })).toBe("星际列车")
  })

  it("injects xhs card structure", () => {
    const prompt = buildImageGeneratePrompt({ prompt: "AI 老板获客", kind: "xhs-card" })

    expect(prompt).toContain("小红书图文卡片生成")
    expect(prompt).toContain("baoyu-xhs-images")
    expect(prompt).toContain("一个核心观点")
    expect(prompt).toContain("AI 老板获客")
  })

  it("normalizes unknown kinds to raw", () => {
    expect(normalizeImageGenerateKind("unknown")).toBe("raw")
  })
})

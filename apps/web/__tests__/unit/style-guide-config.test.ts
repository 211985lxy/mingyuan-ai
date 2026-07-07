import { describe, expect, it } from "vitest"

import {
  STYLE_GUIDE_IDS,
  STYLE_GUIDE_LABELS,
  getStylePromptBlock,
  type StyleGuideId,
} from "@/lib/style-guide-config"

// style-guide-config 是 12 种内置文案风格的配置，供 /api/scripts/polish 的
// imitate（跨行业爆款仿写）模式做本次腔调覆盖。这里只验证配置的完整性。

describe("style-guide-config", () => {
  it("exports exactly 12 built-in style IDs", () => {
    expect(STYLE_GUIDE_IDS).toHaveLength(12)
  })

  it("STYLE_GUIDE_LABELS has exactly 12 keys matching STYLE_GUIDE_IDS", () => {
    const labelKeys = Object.keys(STYLE_GUIDE_LABELS)
    expect(labelKeys).toHaveLength(12)
    for (const id of STYLE_GUIDE_IDS) {
      expect(labelKeys).toContain(id)
    }
  })

  it("getStylePromptBlock returns non-empty string (>20 chars) for each of the 12 styles", () => {
    for (const id of STYLE_GUIDE_IDS) {
      const block = getStylePromptBlock(id)
      expect(typeof block).toBe("string")
      expect(block.length).toBeGreaterThan(20)
      expect(block).toContain(STYLE_GUIDE_LABELS[id])
    }
  })

  it("getStylePromptBlock returns empty string for undefined", () => {
    expect(getStylePromptBlock(undefined)).toBe("")
  })

  it("getStylePromptBlock returns empty string for unknown style", () => {
    expect(getStylePromptBlock("nonexistent" as StyleGuideId)).toBe("")
  })

  it("getStylePromptBlock returns empty string for empty string", () => {
    expect(getStylePromptBlock("" as StyleGuideId)).toBe("")
  })
})

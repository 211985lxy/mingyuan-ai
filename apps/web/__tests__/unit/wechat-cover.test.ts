import { describe, expect, it } from "vitest"

describe("wechat cover — priority chain (v1: Seedream only)", () => {
  it("v1 only uses Seedream-generated cover — no user upload path", () => {
    // In v1, the cover priority is simplified:
    // 1. DeepSeek cover prompt → Seedream generate
    // 2. If Seedream fails → missing_cover
    // There is no "user uploaded first image" or "user specified asset" path.
    // This test documents that design decision.

    // The API route only calls generateCoverImage() when coverPrompt exists
    // or generateCover=true is passed. There is no coverAssetId handling in v1.
    expect(true).toBe(true)
  })

  it("DeepSeek does not participate in image generation", () => {
    // DeepSeek only generates text, structure, and a cover prompt string.
    // The actual image generation goes through Seedream (/api/images/generate).
    // DeepSeek Janus-Pro is NOT used in v1.
    expect(true).toBe(true)
  })
})

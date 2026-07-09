import { describe, expect, it } from "vitest"

import {
  buildProxyImageUrl,
  getProxyImageFallbackSrc,
} from "@/lib/proxy-image-client"

describe("proxy image client helpers", () => {
  it("builds the proxy image URL", () => {
    expect(buildProxyImageUrl("https://example.com/a b.jpg")).toBe(
      "/api/proxy-image?url=https%3A%2F%2Fexample.com%2Fa%20b.jpg",
    )
  })

  it("falls back to the original image once", () => {
    expect(getProxyImageFallbackSrc("https://example.com/a.jpg", false)).toBe(
      "https://example.com/a.jpg",
    )
    expect(getProxyImageFallbackSrc("https://example.com/a.jpg", true)).toBeNull()
  })

  it("skips empty image URLs", () => {
    expect(getProxyImageFallbackSrc("   ", false)).toBeNull()
  })
})

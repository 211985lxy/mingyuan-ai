import { describe, expect, it } from "vitest"
import { compactAccountUrl, formatCount, formatRefreshError, isSupportedCompetitorUrl } from "@/features/competitor/presentation"

describe("competitor presentation", () => {
  it("recognizes supported Douyin account links", () => {
    expect(isSupportedCompetitorUrl("https://www.douyin.com/user/example")).toBe(true)
    expect(isSupportedCompetitorUrl("https://example.com/user/example")).toBe(false)
  })

  it("formats visible monitoring data consistently", () => {
    expect(formatCount(12340)).toBe("1.2w")
    expect(compactAccountUrl("https://www.douyin.com/user/example")).toBe("www.douyin.com/user/example")
    expect(formatRefreshError("Timeout while loading")).toContain("超时")
  })
})

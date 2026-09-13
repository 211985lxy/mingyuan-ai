import { describe, expect, it } from "vitest"
import {
  engagementScore,
  renderAccountHistoryBlock,
  shouldExtractTranscriptNow,
  summarizeAccountHistory,
} from "@/lib/aim/account-work-asset"

describe("账号历史投影", () => {
  it("近 90 天或互动 Top 才立刻抽逐字稿", () => {
    const now = new Date("2026-09-12T00:00:00.000Z")
    expect(shouldExtractTranscriptNow({
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
      signal: { playCount: 10 },
      rankAmongAll: 80,
      now,
    })).toBe(true)
    expect(shouldExtractTranscriptNow({
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      signal: { playCount: 10 },
      rankAmongAll: 80,
      now,
    })).toBe(false)
    expect(shouldExtractTranscriptNow({
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      signal: { playCount: 99999 },
      rankAmongAll: 2,
      now,
    })).toBe(true)
  })

  it("摘要带最佳最差，不把空库编成有历史", () => {
    expect(summarizeAccountHistory([]).summary).toContain("还没有")
    const summary = summarizeAccountHistory([
      { title: "爆款A", publishedAt: new Date(), signalSnapshot: { playCount: 9000, diggCount: 200 }, transcript: "口播" },
      { title: "冷门B", publishedAt: new Date(), signalSnapshot: { playCount: 10 }, transcript: null },
    ])
    expect(summary.bestTitle).toBe("爆款A")
    expect(summary.worstTitle).toBe("冷门B")
    expect(engagementScore({ playCount: 10, diggCount: 1 })).toBeGreaterThan(10)
    const block = renderAccountHistoryBlock({
      summary: summary.summary,
      samples: [{ title: "爆款A", transcript: "口播正文", publishedAt: new Date("2026-09-01") }],
    })
    expect(block).toContain("账号真实发布历史")
    expect(block).toContain("逐字稿摘要")
  })
})

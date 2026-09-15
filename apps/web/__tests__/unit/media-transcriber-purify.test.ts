import { describe, expect, it, vi } from "vitest"
import { purifyMediaTranscript } from "@/lib/media-transcriber/purify"

describe("purifyMediaTranscript", () => {
  const source = "王老师说，门店从12家增长到27家。随后他讲了杭州门店连续三个月复购提升的案例。".repeat(12)

  it("returns a faithful long-form result when the model preserves evidence", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: `## 业务增长\n\n${source}`,
    })
    const result = await purifyMediaTranscript({ title: "访谈", transcript: source }, { complete })
    expect(result.markdown).toContain("12家")
    expect(result.markdown).toContain("27家")
    expect(result.markdown).toContain("杭州门店")
    expect(result.usedFallback).toBe(false)
  })

  it("falls back to the polished transcript when the result is an abnormal summary", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "三点启发：坚持、努力、复盘。" })
    const result = await purifyMediaTranscript({ title: "访谈", transcript: source }, { complete })
    expect(result.markdown).toBe(source)
    expect(result.usedFallback).toBe(true)
  })
})

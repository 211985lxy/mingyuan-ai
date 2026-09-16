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

  it("processes long transcript chunks sequentially", async () => {
    const longSource = "这是一段需要忠实保留的访谈内容。".repeat(900)
    let inFlight = 0
    let maxInFlight = 0
    const complete = vi.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return { content: "整理后的访谈内容。".repeat(500) }
    })

    await purifyMediaTranscript({ title: "长访谈", transcript: longSource }, { complete })

    expect(complete).toHaveBeenCalledTimes(3)
    expect(maxInFlight).toBe(1)
  })
})

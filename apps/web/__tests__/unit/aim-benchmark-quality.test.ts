import { describe, expect, it } from "vitest"

import { assessBenchmarkRewrite, benchmarkCopyReuseRatio } from "@/lib/aim-benchmark-quality"

describe("aim benchmark quality", () => {
  it("flags near-copy outputs using 12-character reuse", () => {
    const original = "我深度使用Codex两个多月了，现在有个特别强烈的感受，普通人的命运又到了重新洗牌的时候。"
    const copied = "我深度使用Codex两个多月了，现在有个特别强烈的感受，普通人的命运又到了重新洗牌的时候。"
    const rewritten = "这两个月我一直拿Codex做业务流程，最明显的感受是，普通人真正要补的是判断和流程。"

    expect(benchmarkCopyReuseRatio(original, copied)).toBeGreaterThanOrEqual(0.35)
    expect(benchmarkCopyReuseRatio(original, rewritten)).toBeLessThan(0.35)
  })

  it("checks whether rewritten copy stays close to original length", () => {
    const original = "普通人做内容最容易卡住的地方，是没有稳定流程。".repeat(10)
    const close = "创业者做表达最容易掉链子的地方，是没有固定系统。".repeat(10)
    const short = "太短了。"

    expect(assessBenchmarkRewrite(original, close).lengthPassed).toBe(true)
    expect(assessBenchmarkRewrite(original, short).lengthPassed).toBe(false)
  })
})

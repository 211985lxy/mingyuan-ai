import { describe, expect, it } from "vitest"

import { runDouyinPublishCheck } from "@/lib/douyin-publish-check"

describe("douyin publish check", () => {
  it("flags high-risk publishing phrases", () => {
    const result = runDouyinPublishCheck("这是全网第一的 AI 神器，私信我领取，100%有效。")

    expect(["高风险勿发", "改完可发"]).toContain(result.verdict)
    expect(result.violations.map((item) => item.text)).toEqual(
      expect.arrayContaining(["全网第一", "私信我", "100%有效"]),
    )
    expect(result.minimalRewrite).not.toContain("私信我")
    expect(result.disclaimer).toContain("不承诺")
    expect(
      result.violations.filter((item) => !item.advisory).every((item) => Boolean(item.ruleId)),
    ).toBe(true)
  })

  it("does not treat normal spoken praise as high-risk advertising", () => {
    const result = runDouyinPublishCheck("我最喜欢的人，是那个一直鼓励我往前走的人。")

    expect(result.verdict).toBe("可发")
    expect(result.violations.filter((item) => !item.advisory)).toHaveLength(0)
  })

  it("does not block personal revenue storytelling without conversion bind", () => {
    const result = runDouyinPublishCheck("我上个月咨询成交了 3 万，过程挺难的。")

    expect(result.violations.some((item) => item.severity === "high" && !item.advisory)).toBe(false)
    expect(result.verdict).not.toBe("高风险勿发")
  })

  it("flags income guarantee bound to conversion as R03", () => {
    const result = runDouyinPublishCheck("保证跟我干三十天回本，加微信进训练营")

    expect(["改完可发", "高风险勿发"]).toContain(result.verdict)
    expect(result.violations.some((item) => item.ruleId === "R03" && !item.advisory)).toBe(true)
  })

  it("flags timed weight-loss claims with checkout CTA as R04", () => {
    const result = runDouyinPublishCheck("吃两周瘦八斤，下方下单")

    expect(result.violations.some((item) => item.ruleId === "R04" && !item.advisory)).toBe(true)
    expect(result.minimalRewrite).not.toMatch(/瘦八斤|保证瘦/)
  })

  it("flags off-platform contact CTA as R05", () => {
    const result = runDouyinPublishCheck("想要的加我 vx8899")

    expect(result.violations.some((item) => item.ruleId === "R05" && !item.advisory)).toBe(true)
    expect(result.violations.find((item) => item.ruleId === "R05")?.suggest).toContain("评论区")
  })

  it("treats bare income mention without guarantee or CTA as non-blocking", () => {
    const result = runDouyinPublishCheck("很多人关心月入这件事，我只想先把方法讲清楚。")

    expect(result.verdict).not.toBe("高风险勿发")
    expect(result.violations.some((item) => item.severity === "high" && !item.advisory)).toBe(false)
  })

  it("keeps report contract fields for UI consumers", () => {
    const result = runDouyinPublishCheck("全网第一，私信我")

    expect(result.disclaimer.length).toBeGreaterThan(10)
    expect(result.verdict).toBeTruthy()
    expect(result.violations).toBeDefined()
    expect(result.trafficScore.level).toMatch(/高|中|低/)
    expect(result.recheckHint).toContain("复检")
    for (const item of result.violations.filter((row) => !row.advisory)) {
      expect(item.ruleId).toBeTruthy()
    }
  })
})

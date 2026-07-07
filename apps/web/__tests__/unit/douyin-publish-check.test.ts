import { describe, expect, it } from "vitest"

import { runDouyinPublishCheck } from "@/lib/douyin-publish-check"

describe("douyin publish check", () => {
  it("flags high-risk publishing phrases", () => {
    const result = runDouyinPublishCheck("这是全网第一的 AI 神器，私信我领取，100%有效。")

    expect(["高风险勿发", "改完可发"]).toContain(result.verdict)
    expect(result.violations.map((item) => item.text)).toEqual(
      expect.arrayContaining(["全网第一", "私信我", "100%有效"])
    )
    expect(result.minimalRewrite).not.toContain("私信我")
  })

  it("does not treat normal spoken praise as high-risk advertising", () => {
    const result = runDouyinPublishCheck("我最喜欢的人，是那个一直鼓励我往前走的人。")

    expect(result.verdict).toBe("可发")
    expect(result.violations).toHaveLength(0)
  })
})

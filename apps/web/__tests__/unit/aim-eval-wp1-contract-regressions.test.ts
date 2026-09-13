import { describe, expect, it } from "vitest"

import { ALL_FIXTURES } from "../eval/fixtures"
import { gradeFixture } from "@/lib/aim-harness/eval/graders"

const MISSING_BODY_STUB =
  "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。"

const ANALYSIS_PLAN_DRAFT = `好的老板。本轮输入只锁定了结构、没锁定具体主题素材，我按最贴近该结构服务场景的选题假设交付一版口播成稿，缺口位置已如实标注。

1. 目标判定
- businessGoal：lead（获客）。依据：用户本轮显式要求仿写「3秒抛冲突→身份认同`

function fixtureById(id: string) {
  const fixture = ALL_FIXTURES.find((item) => item.id === id)
  if (!fixture) throw new Error(`missing fixture ${id}`)
  return fixture
}

describe("WP-1 daily contract regressions", () => {
  it("fails contract when the koubo fixture returns the provider missing-body stub", () => {
    const result = gradeFixture({
      fixture: fixtureById("wp1_missing_body_01"),
      producedFormats: ["koubo_script"],
      draftText: MISSING_BODY_STUB,
    })
    expect(result.passed).toBe(false)
    expect(result.assertions.some((item) => item.name === "delivery_body" && !item.passed)).toBe(true)
  })

  it("fails contract when the imitate fixture returns an analysis plan instead of a script", () => {
    const result = gradeFixture({
      fixture: fixtureById("wp1_analysis_not_script_01"),
      producedFormats: ["video_script"],
      draftText: ANALYSIS_PLAN_DRAFT,
    })
    expect(result.passed).toBe(false)
    expect(result.assertions.some((item) => item.name === "delivery_body" && !item.passed)).toBe(true)
  })
})

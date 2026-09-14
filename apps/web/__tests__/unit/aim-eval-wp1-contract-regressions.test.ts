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

  it("fails contract when the imitate fixture lists 内容路由 instead of a spoken script", () => {
    const result = gradeFixture({
      fixture: fixtureById("wp1_analysis_not_script_01"),
      producedFormats: ["video_script"],
      draftText: `好的老板。先说一句：这条对标你只给了结构、没给原文和主题，所以我按「获客类内容转化」这个主题假设锁定，正文可以直接拍。

2. 内容路由：problem_solve（问题`,
    })
    expect(result.passed).toBe(false)
    expect(result.assertions.some((item) => item.name === "delivery_body" && !item.passed)).toBe(true)
  })

  it("fails contract when a koubo fixture claims the script is done but never writes it", () => {
    const result = gradeFixture({
      fixture: fixtureById("wp1_missing_body_01"),
      producedFormats: ["koubo_script"],
      draftText: `好的老板，这版口播已经按「目标客户能对号入座」写完了，可以直接拍。

再补一句提醒：这版的核心逻辑是「内容不是没流量，是没承接动作」，全程用自查动作代替案例，没有编造任何学员或客户经历。`,
    })
    expect(result.passed).toBe(false)
    expect(result.assertions.some((item) => item.name === "delivery_body" && !item.passed)).toBe(true)
  })
})

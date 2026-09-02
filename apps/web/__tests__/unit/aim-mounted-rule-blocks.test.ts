import { describe, expect, it } from "vitest"

import {
  MOUNTED_RULE_BLOCK_LABELS,
  resolveMountedRuleBlocks,
} from "@/lib/aim/mounted-rule-blocks"

describe("渐进规则块挂载（单一来源）", () => {
  it("发布类关键词挂发布包规则", () => {
    expect(resolveMountedRuleBlocks({ request: "给我整套发布包和发布话题" }))
      .toEqual(expect.arrayContaining(["publish_package"]))
    expect(resolveMountedRuleBlocks({ request: "写一篇口播" }))
      .not.toContainEqual("publish_package")
  })

  it("对标/仿写/改写/复刻或改写任务挂对标防抄袭", () => {
    expect(resolveMountedRuleBlocks({ request: "按对标原文重新写一版" }))
      .toEqual(expect.arrayContaining(["benchmark_guardrail"]))
    expect(resolveMountedRuleBlocks({ request: "随便写点", runtimeTask: "rewrite_copy" }))
      .toEqual(expect.arrayContaining(["benchmark_guardrail"]))
  })

  it("light_edit 与整篇重写/交付验证互斥，只可能放行工具箱", () => {
    const blocks = resolveMountedRuleBlocks({ request: "按对标原文整篇改写", runtimeTask: "light_edit" })
    expect(blocks).not.toContainEqual("benchmark_guardrail")
    expect(blocks).not.toContainEqual("high_risk_loop")
    expect(resolveMountedRuleBlocks({ request: "优化开头", runtimeTask: "light_edit" }))
      .toEqual(["viral_toolkit"])
  })

  it("generate 正式交付挂验证规则；chat 仅质检/点名验证", () => {
    expect(resolveMountedRuleBlocks({ request: "写一篇", runtimeTask: "new_copy", forGenerate: true }))
      .toEqual(expect.arrayContaining(["high_risk_loop"]))
    expect(resolveMountedRuleBlocks({ request: "写一篇", runtimeTask: "new_copy" }))
      .not.toContainEqual("high_risk_loop")
    expect(resolveMountedRuleBlocks({ request: "做一次正式质检" }))
      .toEqual(expect.arrayContaining(["high_risk_loop"]))
  })

  it("标签齐全，供执行轨迹展示", () => {
    expect(MOUNTED_RULE_BLOCK_LABELS.publish_package).toBe("发布包规则")
    expect(MOUNTED_RULE_BLOCK_LABELS.benchmark_guardrail).toBe("对标防抄袭")
  })
})

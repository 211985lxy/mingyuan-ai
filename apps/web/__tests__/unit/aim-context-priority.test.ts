import { describe, expect, it } from "vitest"

import {
  AIM_FACT_PRIORITY_RULE,
  composeAimReferenceContext,
  withAimFactPriorityRule,
} from "@/lib/aim-context-priority"

describe("AIM context fact priority", () => {
  it("defines one explicit instruction and fact conflict order", () => {
    expect(AIM_FACT_PRIORITY_RULE).toContain("用户本轮明确指令")
    expect(AIM_FACT_PRIORITY_RULE).toContain("已确认的项目/IP结构化事实")
    expect(AIM_FACT_PRIORITY_RULE).toContain("长期记忆")
    expect(AIM_FACT_PRIORITY_RULE).toContain("外部热点、竞品和方法论")
    expect(AIM_FACT_PRIORITY_RULE).toContain("不得把推断写成已验证事实")
  })

  it("keeps current material and project knowledge ahead of memory and external references", () => {
    const result = composeAimReferenceContext({
      currentMaterial: "CURRENT",
      projectKnowledge: "PROJECT",
      memory: "MEMORY",
      style: "STYLE",
      externalReference: "EXTERNAL",
    })

    expect(result).toMatch(/^【AIM事实与指令优先级】/)
    expect(result.indexOf("CURRENT")).toBeLessThan(result.indexOf("PROJECT"))
    expect(result.indexOf("PROJECT")).toBeLessThan(result.indexOf("MEMORY"))
    expect(result.indexOf("MEMORY")).toBeLessThan(result.indexOf("EXTERNAL"))
  })

  it("does not duplicate the rule when a context is wrapped twice", () => {
    const once = withAimFactPriorityRule("PROJECT")
    const twice = withAimFactPriorityRule(once)

    expect(twice).toBe(once)
    expect(twice.match(/【AIM事实与指令优先级】/g)).toHaveLength(1)
  })
})

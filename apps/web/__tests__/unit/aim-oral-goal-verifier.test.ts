import { describe, expect, it } from "vitest"

import { verifyOralScriptCraft, verifyMethodologyGoal } from "@/lib/methodology/goal-verifier"
import type { CopyMethodologyPlan } from "@/lib/methodology/resolve-copy-methodology-plan"

const trafficPlan: CopyMethodologyPlan = {
  businessGoal: "traffic",
  contentRoute: "point_of_view",
  cardIds: [],
  structureModules: [],
  confidence: 0.9,
  source: "inferred",
  assumptions: [],
}

describe("oral GoalVerifier craft", () => {
  const goodOral = [
    "其实多数人做口播，败在开头不敢给判断。",
    "",
    "你先记住一句话：先结论，再展开。观众要的是站队，不是痛点清单。",
    "",
    "正确做法是先抛判断，再用一个具体场景证明，最后轻轻承接下一步。",
    "",
    "比如你可以说清谁适合、谁不适合，而不是连珠炮提问把人问跑。",
  ].join("\n")

  const badStackedPain = [
    "你是不是天天拍却没人看？有没有选题焦虑？会不会越写越空？为什么团队越忙越没结果？还在等灵感吗？",
    "",
    "今天分享五个方法。",
    "",
    "第一。",
    "",
    "第二。",
    "",
    "第三。",
    "",
    "第四。",
    "",
    "第五。",
  ].join("\n")

  it("accepts early-judgment oral opening", () => {
    const issues = verifyOralScriptCraft(goodOral, "video_script", "traffic")
    expect(issues.some((i) => i.reason.includes("早期主判断"))).toBe(false)
    expect(issues.some((i) => i.reason.includes("连环堆痛点"))).toBe(false)
  })

  it("flags stacked pain-point openings and sparse short paras", () => {
    const issues = verifyOralScriptCraft(badStackedPain, "video_script", "traffic")
    expect(issues.some((i) => i.reason.includes("连环堆痛点") || i.reason.includes("空行过密"))).toBe(true)
  })

  it("integrates oral craft into methodology goal verify for koubo", () => {
    const result = verifyMethodologyGoal(trafficPlan, [
      { format: "video_script", content: badStackedPain },
    ])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.reason.includes("连环") || i.reason.includes("空行") || i.reason.includes("开头"))).toBe(true)
  })
})

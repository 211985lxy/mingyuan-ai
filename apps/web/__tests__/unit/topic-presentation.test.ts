import { describe, expect, it } from "vitest"
import { categorizeTopicCards, getTopicDisplayLabel, strongestAndWeakest } from "@/features/topics/topic-presentation"
import type { ApiTopicCard } from "@/types/api"

function card(overrides: Partial<ApiTopicCard>): ApiTopicCard {
  return {
    title: "默认客户问题",
    rationale: "",
    contentLine: "",
    scoreReason: "",
    ...overrides,
  } as ApiTopicCard
}

describe("topic presentation", () => {
  it("groups topic cards by their content signal", () => {
    const groups = categorizeTopicCards([
      card({ title: "老板的创业经历" }),
      card({ title: "一个反常识判断" }),
    ])

    expect(groups.map((group) => group.label)).toEqual(["人设类", "观点类"])
    expect(getTopicDisplayLabel(card({ sourceType: "行业热点" }))).toBe("热点类")
  })

  it("keeps the strongest and weakest score dimensions visible", () => {
    const summary = strongestAndWeakest(card({
      scoreBreakdown: { projectFit: 90, contentValue: 70, viralHook: 60, conversionFit: 80, feasibility: 50 },
    }))

    expect(summary?.strongest.label).toBe("项目匹配")
    expect(summary?.weakest.label).toBe("可执行")
  })
})

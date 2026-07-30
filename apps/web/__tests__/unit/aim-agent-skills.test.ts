import { describe, expect, it } from "vitest"

import {
  CONTENT_PRODUCER_SKILLS,
} from "@/lib/aim-agent-skills"

describe("aim agent skills", () => {
  it("拆成三条独立技能：流量漏斗、线索获客、通用故事", () => {
    const ids = CONTENT_PRODUCER_SKILLS.map(s => s.id)
    expect(ids).toEqual(["traffic_funnel", "lead_acquisition", "general_story"])

    const [t, l, g] = CONTENT_PRODUCER_SKILLS
    expect(t.label).toBe("流量漏斗")
    expect(l.label).toBe("线索获客")
    expect(g.label).toBe("通用故事")

    // 每条技能的 prompt 都只提自己的目的，不再出现"先判断 A/B/C"
    expect(t.prompt).toContain("流量漏斗")
    expect(t.prompt).not.toContain("线索获客")
    expect(t.prompt).not.toContain("通用故事")

    expect(l.prompt).toContain("线索获客")
    expect(l.prompt).not.toContain("流量漏斗")
    expect(l.prompt).not.toContain("通用故事")

    expect(g.prompt).toContain("通用故事")
    expect(g.prompt).not.toContain("线索获客")
  })

  it("通用故事保留：人设故事/来时路/置顶视频 的特殊处理分支", () => {
    const general = CONTENT_PRODUCER_SKILLS.find(s => s.id === "general_story")!
    expect(general.prompt).toContain("人设故事")
    expect(general.prompt).toContain("来时路")
    expect(general.prompt).toContain("置顶视频")
    expect(general.prompt).toContain("待补充")
  })
})

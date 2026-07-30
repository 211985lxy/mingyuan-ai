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
  })

  it("三条技能各有独立的写作手法，不混同", () => {
    const [t, l, g] = CONTENT_PRODUCER_SKILLS

    // 流量漏斗：核心是停留/收藏/复看
    expect(t.prompt).toContain("收藏")
    expect(t.prompt).toContain("复看")
    expect(t.prompt).toContain("可收藏性")
    expect(t.prompt).toContain("句锚")

    // 线索获客：核心是精准筛选 + CTA 承接
    expect(l.prompt).toContain("适合谁")
    expect(l.prompt).toContain("不适合谁")
    expect(l.prompt).toContain("信任前置")
    expect(l.prompt).toContain("CTA")

    // 通用故事：核心是真实细节 + 信任资产
    expect(g.prompt).toContain("细节颗粒度")
    expect(g.prompt).toContain("顿悟时刻")
    expect(g.prompt).toContain("人设一致性")
    expect(g.prompt).toContain("不强行推产品")
  })

  it("三条技能互相有对比说明，帮助模型区分目的", () => {
    const [, l, g] = CONTENT_PRODUCER_SKILLS
    // 线索获客 prompt 里有跟流量漏斗的对比
    expect(l.prompt).toContain("跟流量漏斗的区别")
    // 通用故事 prompt 里有跟另外两类的对比
    expect(g.prompt).toContain("跟另外两类的区别")
  })

  it("通用故事保留：人设故事/来时路/置顶视频 的特殊处理分支", () => {
    const general = CONTENT_PRODUCER_SKILLS.find(s => s.id === "general_story")!
    expect(general.prompt).toContain("人设故事")
    expect(general.prompt).toContain("来时路")
    expect(general.prompt).toContain("置顶视频")
    expect(general.prompt).toContain("待补充")
  })
})

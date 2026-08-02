import { describe, expect, it } from "vitest"

import {
  CONTENT_PRODUCER_SKILLS,
} from "@/lib/aim-agent-skills"

describe("aim agent skills", () => {
  it("拆成三条独立技能：我要搞流量、我要获客、我要讲故事", () => {
    const purposeSkills = CONTENT_PRODUCER_SKILLS.filter(s => s.group === "内容目的")
    const ids = purposeSkills.map(s => s.id)
    expect(ids).toEqual(["traffic_funnel", "lead_acquisition", "general_story"])

    const [t, l, g] = purposeSkills
    expect(t.label).toBe("我要搞流量")
    expect(t.description).toBe("结合热点以及经典话题创作。")
    expect(l.label).toBe("我要获客")
    expect(g.label).toBe("我要讲故事")
  })

  it("三条技能各有独立的写作手法，不混同", () => {
    const [t, l, g] = CONTENT_PRODUCER_SKILLS

    // 流量漏斗：热点+经典话题取材，再落到收藏/复看权重
    expect(t.prompt).toContain("【内容目的锚点】= 流量漏斗")
    expect(t.prompt).toContain("结合当下热点与经典常青话题")
    expect(t.prompt).toContain("收藏 > 复看/复访 > 铁粉互动 > 点赞")
    expect(t.prompt).toContain("可收藏抓手、中段断裂感、结尾句锚、转发触发点")

    // 线索获客：核心是精准客户三特征 + 三段公式 + 单一CTA
    expect(l.prompt).toContain("【内容目的锚点】= 线索获客")
    expect(l.prompt).toContain("精准客户三特征")
    expect(l.prompt).toContain("已投入筹码 + 已感到代价 + 正处在决策压力中")
    expect(l.prompt).toContain("做镜子不做自己")
    expect(l.prompt).toContain("问题（刚需痛点）→ 解法（错在哪→为什么→怎么做）→ 方案（小切口")
    expect(l.prompt).toContain("评论/私信/领清单/预约其一")

    // 通用故事：核心是真实细节 + 信任资产 + 缺素材标待补充
    expect(g.prompt).toContain("【内容目的锚点】= 通用故事")
    expect(g.prompt).toContain("叙事走场景→冲突→转折→判断→收束")
    expect(g.prompt).toContain("时间/地点/对话/数字等颗粒度细节要具体")
    expect(g.prompt).toContain("不强行推产品不强行成交")
  })

  it("三条技能互相有对比说明，帮助模型区分目的", () => {
    const [t, l, g] = CONTENT_PRODUCER_SKILLS
    // 每条 prompt 里都有「与另外两类区别」或「与另外两类区别」的差异说明
    expect(t.prompt).toContain("与另外两类区别")
    expect(l.prompt).toContain("与另外两类区别")
    expect(g.prompt).toContain("与另外两类区别")
  })

  it("通用故事保留：人设故事/来时路/置顶视频 的特殊处理分支", () => {
    const general = CONTENT_PRODUCER_SKILLS.find(s => s.id === "general_story")!
    expect(general.prompt).toContain("人设故事/来时路/置顶视频")
    expect(general.prompt).toContain("待补充")
  })
})

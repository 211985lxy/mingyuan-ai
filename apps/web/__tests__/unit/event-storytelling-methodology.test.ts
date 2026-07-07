import { describe, expect, it } from "vitest"

import { shouldUseEventStorytelling } from "@/lib/event-storytelling-methodology"

describe("shouldUseEventStorytelling", () => {
  it("现场记录关键词命中（出差）", () => {
    expect(shouldUseEventStorytelling({ rawInput: "这次出差去了工厂，看到他们的生产线" })).toBe(true)
  })

  it("现场记录关键词命中（项目现场）", () => {
    expect(shouldUseEventStorytelling({ rawInput: "今天去项目现场跟进施工进度" })).toBe(true)
  })

  it("事件复盘关键词命中（复盘）", () => {
    expect(shouldUseEventStorytelling({ rawInput: "复盘一下上次客户拜访的得失" })).toBe(true)
  })

  it("vlog 关键词命中（不区分大小写）", () => {
    expect(shouldUseEventStorytelling({ rawInput: "拍一条工地 VLOG" })).toBe(true)
    expect(shouldUseEventStorytelling({ rawInput: "做个日常日记" })).toBe(true)
  })

  it("从 topicTitle/topicRationale 命中", () => {
    expect(shouldUseEventStorytelling({
      rawInput: "写一条短视频脚本",
      topicTitle: "客户现场见闻",
    })).toBe(true)
  })

  it("普通口播/转化内容不命中", () => {
    expect(shouldUseEventStorytelling({ rawInput: "帮我写一条产品卖点的口播文案" })).toBe(false)
    expect(shouldUseEventStorytelling({ rawInput: "美白精华的核心卖点是什么" })).toBe(false)
  })

  it("空输入不命中", () => {
    expect(shouldUseEventStorytelling({})).toBe(false)
    expect(shouldUseEventStorytelling({ rawInput: "" })).toBe(false)
    expect(shouldUseEventStorytelling({ rawInput: "   " })).toBe(false)
  })

  it("通用文案关键词误判防护", () => {
    // 含"去"但不是现场场景，不应误判
    expect(shouldUseEventStorytelling({ rawInput: "了解过去几年的行业变化" })).toBe(false)
  })
})

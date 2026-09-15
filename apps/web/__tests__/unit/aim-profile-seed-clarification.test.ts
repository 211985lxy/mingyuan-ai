import { describe, expect, it } from "vitest"

import { resolveExecuteTurnGate } from "@/lib/aim/execute-turn-intent-gate"
import { profileSeedFromPages, type IpProfileSeedPage } from "@/lib/aim/ip-profile-seed"
import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"

/**
 * 绑定项目后，档案里已确认的受众/目标不再被重复追问。
 *
 * 回归背景：2026-09 线上，用户已绑全案、档案里写着「核心客户：高客单专业服务老板」，
 * 仍被问「主要给谁看？内容目标是什么？」——门禁只看本轮原话，结构上读不到档案。
 *
 * 线上档案实际形态（已查库核对）：走的是「定位方案→编译→逐页确认」那条路，
 * 页里**没有**「## 我服务谁 / ## 内容目标」小节标题，内容是陈述句，所以：
 * 受众取首句，内容目标在整页里搜目标词。
 */

function envelopeOf(request: string, extra?: Partial<AimContentSourceEnvelope>): AimContentSourceEnvelope {
  return { currentUserRequest: request, relevantConversation: [], referenceMaterials: [], ...extra }
}

/** 有主题、无受众词、无目标词：正是截图里触发追问的指令形态 */
const NEW_DRAFT_REQUEST = "写一条讲本周见客户的视频脚本"

// ── 编译形态（线上实际形态）：无小节标题、陈述句、首句后跟映射表 ──
const COMPILED_AUDIENCE = {
  pageType: "audience" as const,
  content: "核心客户：30-45 岁做高客单专业服务的小老板；行业只作案例背景。"
    + " 痛点角色映射（压缩）： - 老板/创始人：常用痛点 P001、P002 - 销售负责人：常用痛点 P003",
}
const COMPILED_POSITIONING = {
  pageType: "positioning" as const,
  content: "品牌主体是示例品牌，对外身份为企业增长顾问。核心定位：把老板的经验、案例和产品价值变成可持续获客的经营系统。",
}
const COMPILED_STRATEGY = {
  pageType: "content_strategy" as const,
  content: "内容漏斗建议为流量40%、信任35%、转化25%。",
}
const COMPILED_PAGES: IpProfileSeedPage[] = [COMPILED_AUDIENCE, COMPILED_POSITIONING, COMPILED_STRATEGY]

// ── 表单形态：带小节标题，由用户手填 ──
const FORM_PAGES: IpProfileSeedPage[] = [
  {
    pageType: "positioning",
    content: "## 我是谁\n我在重庆江北区做火锅店\n\n## 内容目标\n到店 + 建立懂行老板的人设",
  },
  { pageType: "audience", content: "## 我服务谁\n20-40 岁情侣聚餐、家庭聚餐，想找味道正宗、价格不虚高的火锅店。" },
]

describe("档案兜底：从档案页裁出受众与目标候选", () => {
  it("编译形态：受众取首句，不把后面的痛点映射表带进来", () => {
    const seed = profileSeedFromPages(COMPILED_PAGES)
    expect(seed.audience).toBe("核心客户：30-45 岁做高客单专业服务的小老板；行业只作案例背景")
  })

  it("编译形态：目标候选按「定位主张 > 内容策略底盘」排序", () => {
    const seed = profileSeedFromPages(COMPILED_PAGES)
    expect(seed.goalCandidates?.[0]).toContain("可持续获客的经营系统")
    expect(seed.goalCandidates?.[1]).toContain("内容漏斗建议")
  })

  it("表单形态：内容目标小节排在候选首位，受众取小节原文", () => {
    const seed = profileSeedFromPages(FORM_PAGES)
    expect(seed.goalCandidates?.[0]).toBe("到店 + 建立懂行老板的人设")
    expect(seed.audience).toBe("20-40 岁情侣聚餐、家庭聚餐，想找味道正宗、价格不虚高的火锅店")
  })

  it("同一页型有多版时取最新一版", () => {
    const seed = profileSeedFromPages([
      { pageType: "audience", content: "最新的人群。" },
      { pageType: "audience", content: "过期的人群。" },
    ])
    expect(seed.audience).toBe("最新的人群")
  })

  it("没有档案页时返回空种子", () => {
    expect(profileSeedFromPages([])).toEqual({})
  })
})

describe("档案已声明的字段不再追问", () => {
  const seed = profileSeedFromPages(COMPILED_PAGES)

  it("编译档案 + 无受众/目标词的指令：两问都不再问，直接开写", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf(NEW_DRAFT_REQUEST),
      handling: "deliver",
      profileSeed: seed,
    })
    expect(gate.clarification).toBeNull()
    expect(gate.intent.audience).toBe("核心客户：30-45 岁做高客单专业服务的小老板；行业只作案例背景")
    expect(gate.intent.constraintSources.audience).toBe("project_profile")
    expect(gate.intent.goal).toBe("lead")
    expect(gate.intent.constraintSources.goal).toBe("project_profile")
  })

  it("档案有受众但没目标信号：只问目标，不问受众", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf(NEW_DRAFT_REQUEST),
      handling: "deliver",
      profileSeed: profileSeedFromPages([COMPILED_AUDIENCE]),
    })
    expect(gate.intent.constraintSources.audience).toBe("project_profile")
    expect(gate.clarification?.questions).toHaveLength(1)
    expect(gate.clarification?.questions[0]).toContain("内容目标")
  })

  it("表单形态档案同样覆盖这两问", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf(NEW_DRAFT_REQUEST),
      handling: "deliver",
      profileSeed: profileSeedFromPages(FORM_PAGES),
    })
    expect(gate.clarification).toBeNull()
    expect(gate.intent.goal).toBe("trust")
  })

  it("LLM 追问到的同字段也被档案覆盖", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf(NEW_DRAFT_REQUEST),
      handling: "clarify",
      llmQuestions: ["这篇主要给谁看？", "内容目标是什么？"],
      profileSeed: seed,
    })
    expect(gate.clarification).toBeNull()
  })
})

describe("没有档案兜底时行为不变", () => {
  it("未绑项目：照常追问受众与目标", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf(NEW_DRAFT_REQUEST),
      handling: "deliver",
    })
    expect(gate.intent.constraintSources.audience).toBeUndefined()
    expect(gate.clarification?.questions).toHaveLength(2)
    expect(gate.clarification?.questions[0]).toContain("给谁")
    expect(gate.clarification?.questions[1]).toContain("内容目标")
  })

  it("本轮原话优先于档案", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf("写给实体店老板，讲私域获客"),
      handling: "deliver",
      profileSeed: profileSeedFromPages(COMPILED_PAGES),
    })
    expect(gate.intent.constraintSources.audience).toBe("user_current")
    expect(gate.intent.audience).not.toBe("核心客户：30-45 岁做高客单专业服务的小老板；行业只作案例背景")
    expect(gate.intent.constraintSources.goal).toBe("user_current")
    expect(gate.intent.goal).toBe("lead")
  })
})

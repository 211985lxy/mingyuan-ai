import { describe, expect, it } from "vitest"
import {
  buildMethodologyBlockFromCardIds,
  IP_COPYWRITING_CARDS,
} from "@/lib/methodology/ip-copywriting-cards"
import {
  composeMatchedMethodologyBlock,
  resolveAndComposeMethodologyBlock,
} from "@/lib/methodology/compose-matched-methodology-block"
import { resolveCopyMethodologyPlan } from "@/lib/methodology/resolve-copy-methodology-plan"
import { verifyMethodologyGoal } from "@/lib/methodology/goal-verifier"

describe("resolveCopyMethodologyPlan", () => {
  it("maps 获客/线索 keywords to lead + lead_gen card", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "帮我写一条获客线索短视频，引导私信预约诊断",
      mode: "generate",
    })
    expect(plan.businessGoal).toBe("lead")
    expect(plan.source).toBe("explicit")
    expect(plan.cardIds).toContain("card.lead_gen")
    expect(plan.cardIds.some((id) => id.startsWith("route."))).toBe(true)
    expect(plan.structureModules.length).toBeGreaterThan(0)
  })

  it("maps 成交 to convert", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "写一篇推动成交报名的口播",
      mode: "generate",
    })
    expect(plan.businessGoal).toBe("convert")
    expect(plan.cardIds).toContain("card.convert")
  })

  it("uses TaskSpec desiredAction when raw input has no goal words", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "写一条关于团队管理的口播",
      taskSpec: {
        goal: "写口播",
        mode: "direct_delivery",
        riskLevel: "medium",
        knownFacts: [],
        unknowns: [],
        assumptions: [],
        nextAction: "generate",
        classifiedBy: "rule",
        classifiedAt: new Date().toISOString(),
        desiredAction: "预约诊断",
        useScenario: "转化",
      },
      mode: "generate",
    })
    expect(plan.businessGoal).toBe("lead")
    expect(plan.source).toBe("task_spec")
  })

  it("light_edit with 开头走局部优化卡", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "把开头改得更有钩子",
      runtimeTask: "light_edit",
      mode: "generate",
    })
    expect(plan.localOptimize).toBe("hook")
    expect(plan.cardIds).toContain("local.hook")
  })

  it("完整新稿里的结尾约束不标记为局部优化", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "写一条60秒口播，结尾只引导评论领取清单",
      runtimeTask: "new_copy",
      mode: "generate",
    })

    expect(plan.localOptimize).toBeUndefined()
    expect(plan.cardIds).not.toContain("local.ending")
  })

  it("generate 无信号时推断 lead 并写假设", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "写一条文案",
      mode: "generate",
    })
    expect(plan.businessGoal).toBe("lead")
    expect(plan.source).toBe("inferred")
    expect(plan.assumptions.length).toBeGreaterThan(0)
  })

  it("chat 无信号时保持 unclear", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "写一条文案",
      mode: "chat",
    })
    expect(plan.businessGoal).toBe("unclear")
  })

  it("点名 logo模型 时强制注入 AIDA 宽进窄出结构", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "用logo模型改一下这篇口播，结尾落到我们陪跑",
      mode: "generate",
      runtimeTask: "rewrite_copy",
    })
    expect(plan.structureModel).toBe("logo_aida")
    expect(plan.cardIds).toContain("structure.logo_aida")
    expect(plan.structureModules[0]).toContain("Attention")
    expect(plan.structureModules.at(-1)).toContain("Action")
    expect(plan.localOptimize).toBe("structure")
  })

  it("点名 漏斗模型 同样选中 AIDA 结构卡", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "用漏斗模型改一下这条文案",
      mode: "generate",
      runtimeTask: "rewrite_copy",
    })
    expect(plan.structureModel).toBe("logo_aida")
    expect(plan.cardIds).toContain("structure.logo_aida")
    expect(plan.structureModules).toHaveLength(4)
  })

  it("点名 AIDA 同样选中 LOGO 结构卡", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "按AIDA结构重写",
      mode: "generate",
    })
    expect(plan.structureModel).toBe("logo_aida")
    expect(plan.cardIds[0]).toBe("structure.logo_aida")
  })
})

describe("matched card injection", () => {
  it("compose block only includes selected card bodies", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "获客线索短视频",
      mode: "generate",
    })
    const block = composeMatchedMethodologyBlock(plan)
    expect(block).toContain("card.lead_gen")
    expect(block).toContain("【结构模块")
    // 未选中的成交卡正文不应整包出现（标题可能不在，promptBody 关键句也不应出现）
    const convertCard = IP_COPYWRITING_CARDS.find((c) => c.id === "card.convert")!
    expect(plan.cardIds).not.toContain("card.convert")
    expect(block).not.toContain(convertCard.promptBody.slice(0, 40))
  })

  it("buildMethodologyBlockFromCardIds omits unselected cards", () => {
    const block = buildMethodologyBlockFromCardIds(["card.lead_gen"])
    expect(block).toContain("线索获客")
    expect(block).not.toContain("成交转化视频")
    expect(block).not.toContain("card.traffic")
  })

  it("resolveAndCompose for content_producer uses dynamic cards", () => {
    const { plan, block } = resolveAndComposeMethodologyBlock({
      agentId: "content_producer",
      rawInput: "品牌曝光起号短视频",
      mode: "generate",
      fallbackBlock: "【整包方法论】这是不应默认注入的超长兜底",
    })
    expect(plan.businessGoal).toBe("traffic")
    expect(block).toContain("card.traffic")
    expect(block).not.toContain("【整包方法论】")
  })
})

describe("verifyMethodologyGoal lead CTA", () => {
  it("fails lead copy missing CTA", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "写获客线索口播",
      mode: "generate",
    })
    const result = verifyMethodologyGoal(plan, [
      {
        format: "video_script",
        content:
          "很多人以为做短视频只要有流量就行。其实真正贵的是选错客户。你要有判断标准：适不适合高客单服务。",
      },
    ])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => /CTA|行动/.test(i.reason))).toBe(true)
  })

  it("passes lead copy with cost, filter, and single CTA", () => {
    const plan = resolveCopyMethodologyPlan({
      rawInput: "写获客线索口播",
      mode: "generate",
    })
    const result = verifyMethodologyGoal(plan, [
      {
        format: "video_script",
        content:
          "很多人以为发得多就能获客，其实代价是筛了一堆不买单的咨询。问题在于把流量当线索，错在没判断精准客户。怎么做？给你一个小切口自检：适不适合高客单诊断。场景里见过太多老板踩坑。需要的话私信我「诊断」两个字。",
      },
    ])
    expect(result.ok).toBe(true)
  })
})

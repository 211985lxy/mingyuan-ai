import { describe, expect, it } from "vitest"

import {
  findLightEditScopeViolationFormats,
  findUnsupportedFirstPersonClaimFormats,
  isGenericContentRequestWithoutFacts,
} from "@/lib/aim-generation-prompts"
import { findDroppedStructureModules } from "@/lib/aim-generation-guardrails"
import type { AimGenerateContext } from "@/lib/aim-agent-handlers"

function context(overrides: Partial<AimGenerateContext> = {}): AimGenerateContext {
  return {
    agentId: "content_producer",
    userId: "test",
    rawInput: "写一篇职场沟通文案",
    targetFormats: ["video_script"],
    knowledgeBlock: "",
    methodologyBlock: "",
    businessDiagnosisBlock: "",
    viralStructureBlock: "",
    eventStorytellingBlock: "",
    ipWikiBlock: "",
    retrievedEntries: [],
    retrievedSource: "raw",
    knowledgeStrategy: "deep",
    ...overrides,
  } as AimGenerateContext
}

describe("AIM generation fact guardrails", () => {
  it("flags unsupported first-person customer evidence", () => {
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我有个学员，他每次汇报都说不到重点。" },
      ["video_script"],
    )).toEqual(["video_script"])

    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我以前带过一个新人，他每次汇报都说不到重点。" },
      ["video_script"],
    )).toEqual(["video_script"])

    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我给你讲个真事儿。我们公司去年来了个应届生。" },
      ["video_script"],
    )).toEqual(["video_script"])

    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我观察了太多职场新人，他们汇报都像写日记。" },
      ["video_script"],
    )).toEqual(["video_script"])

    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "上周，我帮一家电商公司做了个客服机器人。" },
      ["video_script"],
    )).toEqual(["video_script"])

    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我见过有人发了三百条，询盘还是零。" },
      ["video_script"],
    )).toEqual(["video_script"])
  })

  it("allows first-person evidence present in project knowledge", () => {
    expect(findUnsupportedFirstPersonClaimFormats(
      context({ knowledgeBlock: "真实案例：我有个学员，他曾经害怕向领导汇报。" }),
      { video_script: "我有个学员，他以前害怕向领导汇报。" },
      ["video_script"],
    )).toEqual([])
  })

  it("allows clearly hypothetical examples", () => {
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "比如有一个人，他每次汇报都说不到重点。" },
      ["video_script"],
    )).toEqual([])
  })

  it("detects generic generation requests that have no factual context", () => {
    expect(isGenericContentRequestWithoutFacts(context({
      rawInput: "帮我写一条视频脚本。",
    }))).toBe(true)
    expect(isGenericContentRequestWithoutFacts(context({
      rawInput: "写一条讲内容获客痛点的视频脚本。",
    }))).toBe(false)
    expect(isGenericContentRequestWithoutFacts(context({
      rawInput: "帮我写一条视频脚本。",
      knowledgeBlock: "产品卖点：每周复盘线索。",
    }))).toBe(false)
  })

  it("flags over-compressed whole-passage polish but not opening-only edits", () => {
    expect(findLightEditScopeViolationFormats(
      {
        rawInput: "【成稿】我们始终坚信，只有把客户价值做到极致，才能赢得市场的尊重。",
        polishInstruction: "请做文字二改/润色，去 AI 味。",
        runtimeTask: "light_edit",
      },
      { raw_copy: "客户价值不是口号，是我们的底线。" },
      ["raw_copy"],
    )).toEqual(["raw_copy"])
    expect(findLightEditScopeViolationFormats(
      {
        rawInput: "原稿：AI 可以帮助企业提升效率，但这段表达太空。",
        polishInstruction: "只修改开头。",
        runtimeTask: "light_edit",
      },
      { raw_copy: "AI 到底有没有用，看它能否减少重复劳动。" },
      ["raw_copy"],
    )).toEqual([])
  })
})

describe("findDroppedStructureModules — lead 线索获客结构检测（Obsidian 02-线索获客打法）", () => {
  // 原稿完整覆盖 Obsidian 三段公式 + 精准客户三特征 + 筛人 + CTA
  // 注意：CTA 用「清单」而非「自检」，避免与方案模块的「自检」标记冲突；
  // 结尾公式句单独成行，便于测试时单独删除。
  const leadSource = [
    "你已经花了十几万推广费，团队也换过两拨，但咨询还是上不来。这就是代价。",
    "问题在哪？很多人误以为是脚本不够好，其实根源是你没找精准客户。",
    "怎么做？给你一个小切口自检方法：用一句话说清你帮谁解决什么，做不到就说明定位还不清。",
    "适合有成熟业务、想用账号获客的老板；只想甩手做IP的不适合。",
    "评论区扣「清单」领完整资料。",
    "记住：精准客户=已投入筹码+已感到代价+正处在决策压力中。",
  ].join("\n")

  it("lead 输出删掉「方案-小切口」模块时，应被检测出来", () => {
    // 输出保留了精准客户三特征、问题、解法、筛人、CTA、句锚，但删掉了小切口方案那一段
    const outputMissingSolution = [
      "你已经花了十几万推广费，团队也换过两拨，咨询还是上不来。这就是代价。",
      "问题在哪？很多人误以为是脚本不够好，其实根源是没找精准客户。",
      "适合有成熟业务的老板；只想甩手做IP的不适合。",
      "评论区扣「清单」领完整资料。",
      "记住：精准客户=已投入筹码+已感到代价+正处在决策压力中。",
    ].join("\n")
    const dropped = findDroppedStructureModules(leadSource, outputMissingSolution, "lead")
    expect(dropped).toContain("方案-小切口")
  })

  it("lead 输出删掉「精准客户三特征落地」时，应被检测出来", () => {
    // 输出删掉了第一行精准客户三特征场景 + 结尾公式句（公式句里也含三特征关键词，必须一起删）
    const outputMissingPrecision = [
      "问题在哪？很多人误以为是脚本不够好，其实根源是没找精准客户。",
      "怎么做？给你一个小切口自检方法：用一句话说清你帮谁解决什么。",
      "适合有成熟业务的老板；只想甩手做IP的不适合。",
      "评论区扣「清单」领完整资料。",
    ].join("\n")
    const dropped = findDroppedStructureModules(leadSource, outputMissingPrecision, "lead")
    expect(dropped).toContain("精准客户三特征落地")
  })

  it("lead 输出保留全部结构模块时，不应误报", () => {
    // 输出保留了所有结构模块（仅文字润色）
    const outputFull = [
      "你之前已经砸了十几万推广费，团队换过两拨，咨询还是上不来——这就是代价。",
      "问题在哪？很多人误判为脚本不行，其实根源是没锁定精准客户。",
      "怎么做？给你一个小切口自检：用一句话说清你帮谁解决什么。",
      "适合有成熟业务、想用账号获客的老板；只想甩手做IP的不适合。",
      "评论区扣「清单」领完整资料。",
      "记住：精准客户=已投入筹码+已感到代价+正处在决策压力中。",
    ].join("\n")
    const dropped = findDroppedStructureModules(leadSource, outputFull, "lead")
    // 允许返回数组，但不应包含 lead 关键模块
    expect(dropped).not.toContain("精准客户三特征落地")
    expect(dropped).not.toContain("问题-刚需痛点")
    expect(dropped).not.toContain("解法-错在哪/为什么/怎么做")
    expect(dropped).not.toContain("方案-小切口")
    expect(dropped).not.toContain("谁适合/谁不适合")
  })

  it("traffic 流量型不调用 lead 严格检测（不在 lead 分支）", () => {
    // 同样的原文，purpose=traffic 时不会进入 checkAll 分支
    const dropped = findDroppedStructureModules(leadSource, "完全不同的短输出", "traffic")
    expect(dropped).not.toContain("精准客户三特征落地")
    expect(dropped).not.toContain("方案-小切口")
  })
})

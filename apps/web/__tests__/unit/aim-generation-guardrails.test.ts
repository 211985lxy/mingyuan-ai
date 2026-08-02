import { describe, expect, it } from "vitest"

import {
  findLightEditScopeViolationFormats,
  findUnsupportedFirstPersonClaimFormats,
  isGenericContentRequestWithoutFacts,
} from "@/lib/aim-generation-prompts"
import {
  findDroppedStructureModules,
  findUnsupportedNumericClaimFormats,
  scrubUnsupportedAnecdoteSentences,
  scrubUnsupportedNumericSentences,
} from "@/lib/aim-generation-guardrails"
import { scrubLeakedLightEditFeedback } from "@/lib/aim-generation-text"
import { AIM_FACT_PRIORITY_RULE } from "@/lib/aim-context-priority"
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

    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我见过太多老板卡在这儿。比如先替客户说出痛点。" },
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

  it("blocks ungrounded friend and industry-owner anecdotes", () => {
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我有一个朋友，最近靠内容拿到了很多客户。" },
      ["video_script"],
    )).toEqual(["video_script"])
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "有位装修老板，之前做了很多内容却没有询盘。" },
      ["video_script"],
    )).toEqual(["video_script"])
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "上周我看到一个老板的视频，内容做得很热闹。" },
      ["video_script"],
    )).toEqual(["video_script"])
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我上周就遇到几个老板，他们都说内容获客很难。" },
      ["video_script"],
    )).toEqual(["video_script"])
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "之前有一家本地服务公司做了口播。后来咨询数据明显增长。" },
      ["video_script"],
    )).toEqual(["video_script"])
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "有个做电商的老板问过我，内容到底怎么获客。" },
      ["video_script"],
    )).toEqual(["video_script"])
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "很多老板问我，我们也在发内容，为什么线索质量上不来？" },
      ["video_script"],
    )).toEqual(["video_script"])
    expect(findUnsupportedFirstPersonClaimFormats(
      context(),
      { video_script: "我跟几个老板聊过，他们都说内容获客很难。" },
      ["video_script"],
    )).toEqual(["video_script"])
  })

  it("allows creative marketing numbers while preserving strict fact checks", () => {
    expect(findUnsupportedNumericClaimFormats(
      context(),
      { video_script: "90%的老板都把内容获客做错了。" },
      ["video_script"],
    )).toEqual([])
    expect(findUnsupportedNumericClaimFormats(
      context({ knowledgeBlock: "调研结果：90%的受访者更关注真实案例。" }),
      { video_script: "调研显示，90%的受访者更关注真实案例。" },
      ["video_script"],
    )).toEqual([])
    expect(findUnsupportedNumericClaimFormats(
      context({ knowledgeBlock: "目标客户：年营收300-3000万的本地服务老板。" }),
      { video_script: "有位年营收500万的老板，靠内容获得了20条线索。" },
      ["video_script"],
    )).toEqual([])
    expect(findUnsupportedNumericClaimFormats(
      context(),
      { video_script: "解决这个问题可以先做3步：明确客户、选择问题、设计承接。" },
      ["video_script"],
    )).toEqual([])
    expect(findUnsupportedNumericClaimFormats(
      context(),
      { video_script: "比如客服团队用 AI 自动处理八成常见问题。" },
      ["video_script"],
    )).toEqual([])
  })

  it("allows creative numbers and illustrative scenarios in light edits", () => {
    const lightEditContext = context({
      rawInput: "原稿：AI 可以帮助企业提升效率，但这段表达太空。",
      polishInstruction: "只修改开头，让它更具体。",
      runtimeTask: "light_edit",
    })
    expect(findUnsupportedNumericClaimFormats(
      lightEditContext,
      { video_script: "比如把原本一周的工作压缩到半天。" },
      ["video_script"],
    )).toEqual([])
    expect(findUnsupportedFirstPersonClaimFormats(
      lightEditContext,
      { video_script: "一家贸易公司的财务部门用 AI 批量对账、识别异常。" },
      ["video_script"],
    )).toEqual([])
    expect(findUnsupportedFirstPersonClaimFormats(
      lightEditContext,
      { video_script: "AI 提效不是口号，而是把重复工作真正交给工具。" },
      ["video_script"],
    )).toEqual([])
  })

  it("ignores structural numbers inside the method note while checking the delivered body", () => {
    const lightEditContext = context({
      rawInput: "原稿：AI 可以帮助企业提升效率。",
      polishInstruction: "只修改开头。",
      runtimeTask: "light_edit",
    })
    expect(findUnsupportedNumericClaimFormats(
      lightEditContext,
      { video_script: "[[AIM_METHOD_NOTE]]优化前三秒钩子。[[/AIM_METHOD_NOTE]]\n\nAI 提效不是口号。" },
      ["video_script"],
    )).toEqual([])
    expect(findUnsupportedNumericClaimFormats(
      lightEditContext,
      { video_script: "[[AIM_METHOD_NOTE]]优化前三秒钩子。[[/AIM_METHOD_NOTE]]\n\n把一周工作压缩到半天。" },
      ["video_script"],
    )).toEqual([])
  })

  it("removes inline user criticism from the light-edit body but keeps its method note", () => {
    const result = scrubLeakedLightEditFeedback(
      "[[AIM_METHOD_NOTE]]用户认为这段表达太空。[[/AIM_METHOD_NOTE]]\n\nAI 能接手重复流程，但这段表达太空。",
      "原稿：AI 可以帮助企业提升效率，但这段表达太空。",
    )
    expect(result).toBe(
      "[[AIM_METHOD_NOTE]]用户认为这段表达太空。[[/AIM_METHOD_NOTE]]\n\nAI 能接手重复流程。",
    )
  })

  it("allows structural counts but blocks result counts in a strict brief", () => {
    const strictContext = context({
      rawInput: "只允许60天、40条，不得编造其他数字",
    })
    expect(findUnsupportedNumericClaimFormats(
      strictContext,
      { video_script: "可以先做三条检查，一天内把问题列清楚。" },
      ["video_script"],
    )).toEqual([])
    expect(findUnsupportedNumericClaimFormats(
      strictContext,
      { video_script: "最终获得20条线索。" },
      ["video_script"],
    )).toEqual(["video_script"])
    expect(findUnsupportedNumericClaimFormats(
      strictContext,
      { video_script: "先检查最近10条内容，再统一选题标准。" },
      ["video_script"],
    )).toEqual(["video_script"])
  })

  it("drops complete sentences with unauthorized numbers before delivery", () => {
    const rawInput = "只允许60天、40条，不得编造其他数字"
    const result = scrubUnsupportedNumericSentences(
      "先把客户问题讲清楚。只要一元投入就能成交。60天产出40条内容。最后给出明确行动。",
      rawInput,
    )

    expect(result).toBe("先把客户问题讲清楚。60天产出40条内容。最后给出明确行动。")
  })

  it("keeps creative numbers unless the brief explicitly enables strict fact mode", () => {
    const content = "先说结论。比如客服能自动处理八成问题。资料显示响应成本降低20%。"
    expect(scrubUnsupportedNumericSentences(content, "写一段 AI 提效文案"))
      .toBe(content)
    expect(scrubUnsupportedNumericSentences(
      content,
      "资料显示响应成本降低20%，不得编造其他数字",
    )).toBe("先说结论。资料显示响应成本降低20%。")
  })

  it("drops unapproved first-person anecdotes from a closed-world fact brief", () => {
    const rawInput = "必须准确引用两个事实：某公司60天产出40条内容。痛点是产能不稳。不得编造其他数字"
    const result = scrubUnsupportedAnecdoteSentences(
      "先讲清楚客户问题。很多老板问我，为什么线索质量上不来？某公司60天产出40条内容。最后给出行动。",
      rawInput,
    )

    expect(result).toBe("先讲清楚客户问题。某公司60天产出40条内容。最后给出行动。")
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
    expect(isGenericContentRequestWithoutFacts(context({
      rawInput: "帮我写一条视频脚本。",
      knowledgeBlock: AIM_FACT_PRIORITY_RULE,
    }))).toBe(true)
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
    expect(findLightEditScopeViolationFormats(
      {
        rawInput: "原稿：AI 可以帮助企业提升效率，但这段表达太空。",
        polishInstruction: "只修改开头。",
        runtimeTask: "light_edit",
      },
      { raw_copy: "[[AIM_METHOD_NOTE]]优化前三秒。[[/AIM_METHOD_NOTE]]" },
      ["raw_copy"],
    )).toEqual(["raw_copy"])
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

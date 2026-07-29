import { describe, expect, it } from "vitest"

import {
  findLightEditScopeViolationFormats,
  findUnsupportedFirstPersonClaimFormats,
  isGenericContentRequestWithoutFacts,
} from "@/lib/aim-generation-prompts"
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

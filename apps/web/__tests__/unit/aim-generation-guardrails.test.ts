import { describe, expect, it } from "vitest"

import { findUnsupportedFirstPersonClaimFormats } from "@/lib/aim-generation-prompts"
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
})

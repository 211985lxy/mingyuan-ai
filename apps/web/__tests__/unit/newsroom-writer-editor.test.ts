import { describe, expect, it } from "vitest"
import {
  buildContentEditorRevisePrompt,
  parseEditorReviseOutput,
} from "@/lib/aim-agent-content-review-prompts"
import { NEWSROOM_SAMPLE_CITATION_RULE } from "@/lib/aim-content-creation-trace"
import { buildRawInputWithOpportunityBrief } from "@/lib/aim-generate-context"
import { buildSourceBrief } from "@/features/newsroom/services/build-source-brief"
import { getMaterialAnchorsFromTaskSpec } from "@/features/newsroom/services/build-source-brief"

describe("newsroom writer + editor", () => {
  it("injects opportunity brief into rawInput once", () => {
    const brief = buildSourceBrief({
      collectionId: "c1",
      items: [{
        platform: "douyin",
        sourceId: "a",
        sourceUrl: "https://x/a",
        title: "标题A",
        authorName: "作者",
        likes: 10,
      }],
    })
    const once = buildRawInputWithOpportunityBrief("写口播", brief)
    expect(once).toContain("内容机会样本锚点")
    expect(once).toContain("[样本1] id=douyin:a")
    const twice = buildRawInputWithOpportunityBrief(once, brief)
    expect(twice).toBe(once)
  })

  it("detects material anchors on taskSpec for citation policy", () => {
    const brief = buildSourceBrief({
      collectionId: "c1",
      items: [{
        platform: "douyin",
        sourceId: "a",
        sourceUrl: "https://x/a",
        title: "标题A",
        authorName: "作者",
      }],
    })
    const restored = getMaterialAnchorsFromTaskSpec({
      goal: "写",
      mode: "direct_delivery",
      riskLevel: "low",
      knownFacts: [],
      unknowns: [],
      assumptions: [],
      nextAction: "交付",
      classifiedBy: "rule",
      classifiedAt: new Date().toISOString(),
      materialAnchors: brief,
    })
    expect(restored?.samples[0]?.id).toBe("douyin:a")
    expect(NEWSROOM_SAMPLE_CITATION_RULE).toContain("[样本N]")
  })

  it("parses editor revise FINAL and DIFF markers", () => {
    expect(buildContentEditorRevisePrompt("kb")).toContain("主编终审官")
    const parsed = parseEditorReviseOutput(`
[[AIM_EDITOR_DIFF]]
- 强化开头钩子
- 去掉绝对化用语
[[/AIM_EDITOR_DIFF]]
[[AIM_EDITOR_FINAL]]
这是终稿[样本1]。
[[/AIM_EDITOR_FINAL]]
`)
    expect(parsed.requestRewrite).toBe(false)
    expect(parsed.finalContent).toContain("这是终稿")
    expect(parsed.diffSummary).toContain("强化开头钩子")
  })
})

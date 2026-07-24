import { describe, expect, it } from "vitest"
import { buildSourceBrief, formatSourceBriefSummary, getMaterialAnchorsFromTaskSpec } from "@/features/newsroom/services/build-source-brief"
import { extractSampleCitationIndexes, gradeSampleCitations } from "@/features/newsroom/services/citation-grader"
import { sourceItemId } from "@/features/newsroom/contracts"

describe("newsroom SourceBrief", () => {
  const items = [
    {
      platform: "douyin",
      sourceId: "v1",
      sourceUrl: "https://douyin.com/v1",
      title: "命理入门误区",
      authorName: "甲老师",
      likes: 1200,
      opportunityScore: 0.82,
    },
    {
      platform: "wechat_channels",
      sourceId: "v2",
      sourceUrl: "https://channels.weixin.qq.com/v2",
      title: "八字看事业",
      authorName: "乙老师",
      likes: 800,
    },
  ]

  const analysis = {
    highFrequencyThemes: ["命理误区"],
    commonOpenings: [],
    contentStructures: [],
    sharedViewpoints: [],
    commentNeeds: [],
    homogeneityRisk: "中",
    reusablePatterns: [],
    avoidExpressions: ["绝对能改命"],
    originalAngles: [],
    candidateTopics: [
      {
        title: "三个命理误区",
        angle: "纠错",
        rationale: "高频主题",
        referencedSamples: [sourceItemId("douyin", "v1"), "样本2"],
      },
    ],
  }

  it("maps collection items + analysis into SourceBrief with stable ids", () => {
    const brief = buildSourceBrief({
      collectionId: "col-1",
      collectionName: "命理研究",
      items,
      analysisResult: analysis,
    })

    expect(brief.samples).toHaveLength(2)
    expect(brief.samples[0].id).toBe("douyin:v1")
    expect(brief.samples[0].index).toBe(1)
    expect(brief.theme).toBe("命理误区")
    expect(brief.mustCite).toEqual(expect.arrayContaining(["douyin:v1", "wechat_channels:v2"]))
    expect(brief.avoidCopy).toContain("绝对能改命")
    expect(brief.groundingPolicy.requireSampleCitation).toBe(true)
  })

  it("round-trips via taskSpec.materialAnchors helper", () => {
    const brief = buildSourceBrief({ collectionId: "col-1", items, analysisResult: analysis })
    const taskSpec = {
      goal: "写口播",
      mode: "direct_delivery",
      riskLevel: "low",
      knownFacts: [],
      unknowns: [],
      assumptions: [],
      nextAction: "交付",
      classifiedBy: "rule",
      classifiedAt: new Date().toISOString(),
      materialAnchors: brief,
      newsroom: { stage: "writing_ready", collectionId: "col-1", sourceCount: 2 },
    }
    const restored = getMaterialAnchorsFromTaskSpec(taskSpec)
    expect(restored?.samples.map((s) => s.id)).toEqual(["douyin:v1", "wechat_channels:v2"])
    expect(formatSourceBriefSummary(brief)).toContain("[样本1]")
    expect(formatSourceBriefSummary(brief)).toContain("taskSpec.materialAnchors")
  })

  it("grades citations against allowed sample indexes", () => {
    const brief = buildSourceBrief({ collectionId: "col-1", items, analysisResult: analysis })
    expect(extractSampleCitationIndexes("开头[样本1]中间[样本9]结尾")).toEqual([1, 9])

    const pass = gradeSampleCitations({
      content: "钩子[样本1]。论证[样本2]。",
      brief,
    })
    expect(pass.ok).toBe(true)
    expect(pass.illegal).toEqual([])

    const fail = gradeSampleCitations({
      content: "编造[样本99]",
      brief,
    })
    expect(fail.ok).toBe(false)
    expect(fail.illegal).toContain(99)
  })
})

import { describe, expect, it } from "vitest"
import { buildTopicDailyReport } from "@/lib/topic-daily-report"
import type { ApiAiHotBriefingItem, ApiTopicCard } from "@/types/api"

const cards: ApiTopicCard[] = [
  {
    title: "低分备选",
    elementCodes: ["cost"],
    openingTypeCode: "benefit_open",
    structureCode: "pain_solution",
    score: 72,
    rationale: "可做但不是今天主推。",
  },
  {
    title: "AI工具先看流程",
    elementCodes: ["practical", "trust"],
    openingTypeCode: "pain_open",
    structureCode: "proof_first",
    score: 91,
    rationale: "最贴近创作者当下的生产痛点。",
    hook: "别先追新功能，先看它能不能帮你少做重复活。",
    angle: "围绕素材整理、粗剪和复用三个流程展开。",
    cta: "评论“流程”，领取 AI 内容生产检查表。",
  },
]

function item(index: number): ApiAiHotBriefingItem {
  return {
    id: `hot-${index}`,
    title: `热点 ${index}`,
    source: "AI HOT",
    publishedAt: "2099-01-01T00:00:00.000Z",
    timeText: "1 小时前",
    summary: `摘要 ${index}`,
    url: `https://example.com/${index}`,
    category: "ai-products",
    categoryLabel: "产品发布/更新",
  }
}

describe("buildTopicDailyReport", () => {
  it("uses the highest score card as the lead topic", () => {
    const report = buildTopicDailyReport(cards, [item(1)], "daily")

    expect(report.leadCard?.title).toBe("AI工具先看流程")
    expect(report.conclusion).toContain("AI工具先看流程")
    expect(report.execution.action).toContain("流程")
  })

  it("uses AI HOT as capped fallback evidence when no source snapshot exists", () => {
    const report = buildTopicDailyReport(
      cards,
      Array.from({ length: 8 }, (_, index) => item(index + 1)),
      "daily",
    )

    expect(report.hasSourceSnapshot).toBe(false)
    expect(report.evidenceGroups).toHaveLength(1)
    expect(report.evidenceGroups[0].key).toBe("hot")
    expect(report.evidenceGroups[0].items).toHaveLength(4)
  })

  it("builds a report without AIHOT items", () => {
    const report = buildTopicDailyReport(cards, [], "daily")

    expect(report.evidenceGroups).toHaveLength(0)
    expect(report.workshop[0].hook).toBe("可做但不是今天主推。")
  })

  it("copy text includes lead title and CTA", () => {
    const report = buildTopicDailyReport(cards, [item(1)], "daily")

    expect(report.copyText).toContain("AI工具先看流程")
    expect(report.copyText).toContain("评论“流程”")
  })

  it("includes benchmark video sources in daily report", () => {
    const report = buildTopicDailyReport(cards, [item(1)], "daily", [
      {
        category: "benchmark_reference",
        title: "对标拆解视频",
        content: "结构化拆解：反差开头，痛点到方案。",
      },
    ])

    expect(report.hasSourceSnapshot).toBe(true)
    expect(report.evidenceGroups[0].key).toBe("benchmark")
    expect(report.evidenceGroups[0].items[0].title).toBe("对标拆解视频")
    expect(report.evidenceGroups[0].items[0].content).toContain("反差开头")
  })

  it("explains lead decision with score breakdown when available", () => {
    const report = buildTopicDailyReport([
      {
        ...cards[1],
        scoreBreakdown: {
          projectFit: 92,
          contentValue: 88,
          viralHook: 70,
          conversionFit: 82,
          feasibility: 86,
        },
        scoreReason: "项目匹配和内容价值更强。",
      },
    ], [], "daily")

    expect(report.reason).toContain("总分 91")
    expect(report.reason).toContain("强项是项目匹配")
    expect(report.reason).toContain("短板是传播钩子")
  })
})

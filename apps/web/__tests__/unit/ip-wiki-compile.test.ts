import { describe, expect, it } from "vitest"
import {
  buildCompilePrompt,
  parseCompileJson,
} from "@/lib/ip-wiki/compile"

describe("ip-wiki compile", () => {
  it("parses structured wiki pages from compiler json", () => {
    const parsed = parseCompileJson(
      JSON.stringify({
        pages: [
          {
            pageType: "content_strategy",
            title: "内容策略底盘",
            content: "围绕 AI 工具教程做深度内容……",
            frontmatter: {
              topicDistribution: [{ topic: "AI工具与教程", percentage: 40 }],
              contentFormats: [{ format: "深度教程/分析", percentage: 58 }],
              hookPatterns: ["痛点提问", "数字吸引"],
              postingFrequency: "每周 3-4 条",
              bestPostingTimes: "工作日 18:00-21:00",
              viralFormula: "高价值信息 + 实操教程 + 热点话题 + 强烈情绪",
            },
            sources: [{ kind: "aim_generation", id: "gen-1", label: "定位方案" }],
            links: ["定位主张", "人设"],
          },
          {
            pageType: "positioning",
            title: "定位主张",
            content: "帮中小企业老板用 AI 降本增效。",
            frontmatter: {},
            links: ["内容策略底盘"],
          },
        ],
      }),
      "gen-1"
    )

    expect(parsed).toHaveLength(2)
    expect(parsed[0].pageType).toBe("content_strategy")
    expect(parsed[0].frontmatter.viralFormula).toBe(
      "高价值信息 + 实操教程 + 热点话题 + 强烈情绪"
    )
    expect(parsed[0].links).toEqual(["定位主张", "人设"])
    // 已有显式来源时不回填
    expect(parsed[0].sources).toEqual([
      { kind: "aim_generation", id: "gen-1", label: "定位方案" },
    ])
    // 无显式来源时回填定位方案来源
    expect(parsed[1].sources).toEqual([
      { kind: "aim_generation", id: "gen-1", label: "定位方案" },
    ])
  })

  it("drops pages with invalid pageType or missing title/content", () => {
    const parsed = parseCompileJson(
      JSON.stringify({
        pages: [
          { pageType: "not_a_real_type", title: "x", content: "y" },
          { pageType: "persona", title: "  ", content: "y" },
          { pageType: "persona", title: "人设", content: "" },
          { pageType: "audience", title: "人群", content: "可用" },
        ],
      })
    )
    expect(parsed).toEqual([
      expect.objectContaining({ pageType: "audience", title: "人群" }),
    ])
  })

  it("returns empty for invalid json or empty pages", () => {
    expect(parseCompileJson("not-json")).toEqual([])
    expect(parseCompileJson(JSON.stringify({ pages: [] }))).toEqual([])
    expect(parseCompileJson(JSON.stringify({}))).toEqual([])
  })

  it("builds a bounded compile prompt that carries the positioning text", () => {
    const prompt = buildCompilePrompt({
      positioningText: "我们帮中小企业用 AI 做内容营销，定位实战型专家。",
      projectName: "某 AI 营销全案",
      existingPages: [{ pageType: "content_strategy", title: "旧内容策略底盘" }],
      sourceGenerationId: "gen-9",
    })

    expect(prompt).toContain("IP 定位维基的编译器")
    expect(prompt).toContain("content_strategy")
    expect(prompt).toContain("topicDistribution")
    expect(prompt).toContain("建议比例")
    expect(prompt).toContain("某 AI 营销全案")
    expect(prompt).toContain("旧内容策略底盘")
    expect(prompt).toContain("gen-9")
    expect(prompt).toContain("帮中小企业用 AI 做内容营销")
    expect(prompt.length).toBeLessThan(12000)
  })
})

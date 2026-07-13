import { describe, expect, it } from "vitest"
import { lintIpWikiPages } from "@/lib/ip-wiki/lint"
import type { IpWikiPageRow } from "@/lib/ip-wiki/repo"

function makeRow(overrides: Partial<IpWikiPageRow>): IpWikiPageRow {
  return {
    id: "id",
    projectId: "proj-1",
    pageType: "positioning",
    title: "标题",
    content: "正文",
    frontmatter: {},
    sources: [],
    links: [],
    sourceGenerationId: null,
    version: 1,
    status: "active",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

function fullStrategyFrontmatter(overrides: Record<string, unknown> = {}) {
  return {
    topicDistribution: [{ topic: "AI工具", percentage: 60 }, { topic: "老板故事", percentage: 40 }],
    contentFormats: [{ format: "教程", percentage: 70 }, { format: "口播", percentage: 30 }],
    hookPatterns: ["痛点提问"],
    postingFrequency: "每周 3 条",
    bestPostingTimes: "工作日晚间",
    viralFormula: "价值+情绪",
    ...overrides,
  }
}

/** 用六类核心页 + 合规 frontmatter 构造一份"健康"维基 */
function healthyPages(): IpWikiPageRow[] {
  return [
    makeRow({ id: "p-pos", pageType: "positioning", title: "定位主张", content: "x" }),
    makeRow({ id: "p-per", pageType: "persona", title: "人设", content: "x" }),
    makeRow({
      id: "p-strat",
      pageType: "content_strategy",
      title: "内容策略底盘",
      content: "x",
      frontmatter: fullStrategyFrontmatter(),
    }),
    makeRow({ id: "p-aud", pageType: "audience", title: "目标人群", content: "x" }),
    makeRow({ id: "p-conv", pageType: "conversion_path", title: "成交路径", content: "x" }),
    makeRow({ id: "p-top", pageType: "topic_direction", title: "选题方向", content: "x" }),
  ]
}

describe("lintIpWikiPages", () => {
  it("passes (no errors) on a complete, well-formed wiki", () => {
    const report = lintIpWikiPages(healthyPages())
    expect(report.passed).toBe(true)
    expect(report.errorCount).toBe(0)
    expect(report.totalPages).toBe(6)
  })

  it("flags missing core page types", () => {
    const pages = healthyPages().filter((p) => p.pageType !== "audience")
    const report = lintIpWikiPages(pages)
    const missing = report.findings.filter((f) => f.rule === "missing_core_page")
    expect(missing).toHaveLength(1)
    expect(missing[0].pageType).toBe("audience")
    expect(missing[0].severity).toBe("warning")
    // 缺核心页是 warning，不应阻断 passed
    expect(report.passed).toBe(true)
  })

  it("errors when content_strategy is missing a required chassis field", () => {
    const pages = healthyPages().map((p) =>
      p.id === "p-strat"
        ? { ...p, frontmatter: fullStrategyFrontmatter({ viralFormula: undefined, postingFrequency: "" }) }
        : p
    )
    const report = lintIpWikiPages(pages)
    const fieldErrors = report.findings.filter((f) => f.rule === "missing_chassis_field")
    expect(fieldErrors).toHaveLength(2)
    expect(fieldErrors.every((f) => f.severity === "error")).toBe(true)
    expect(report.passed).toBe(false)
  })

  it("warns on dead links (link target not present among active pages)", () => {
    const pages = healthyPages().map((p) =>
      p.id === "p-pos" ? { ...p, links: ["人设", "不存在的页"] } : p
    )
    const report = lintIpWikiPages(pages)
    const dead = report.findings.filter((f) => f.rule === "dead_link")
    expect(dead).toHaveLength(1)
    expect(dead[0].message).toContain("不存在的页")
  })

  it("warns when topic distribution percentages diverge far from 100", () => {
    const pages = healthyPages().map((p) =>
      p.id === "p-strat"
        ? { ...p, frontmatter: fullStrategyFrontmatter({ topicDistribution: [{ topic: "A", percentage: 30 }, { topic: "B", percentage: 20 }] }) }
        : p
    )
    const report = lintIpWikiPages(pages)
    const sum = report.findings.filter((f) => f.rule === "strategy_sum")
    expect(sum).toHaveLength(1)
    expect(sum[0].message).toContain("50%")
  })

  it("flags stale aim_generation sources when id not in known set", () => {
    const pages = healthyPages().map((p) =>
      p.id === "p-pos"
        ? makeRow({ ...p, sources: [{ kind: "aim_generation", id: "gen-old", label: "定位方案" }] })
        : p
    )
    const report = lintIpWikiPages(pages, { existingGenerationIds: new Set(["gen-other"]) })
    const stale = report.findings.filter((f) => f.rule === "stale_source")
    expect(stale).toHaveLength(1)
    expect(stale[0].message).toContain("gen-old")
  })

  it("skips stale_source check when existingGenerationIds is not provided", () => {
    const pages = healthyPages().map((p) =>
      p.id === "p-pos"
        ? makeRow({ ...p, sources: [{ kind: "aim_generation", id: "gen-old", label: "定位方案" }] })
        : p
    )
    const report = lintIpWikiPages(pages)
    expect(report.findings.filter((f) => f.rule === "stale_source")).toHaveLength(0)
  })
})

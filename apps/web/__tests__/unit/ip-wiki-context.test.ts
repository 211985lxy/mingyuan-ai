import { describe, expect, it } from "vitest"
import { formatIpWikiBlock } from "@/lib/ip-wiki/context"
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

describe("formatIpWikiBlock", () => {
  it("returns empty string when no pages", () => {
    expect(formatIpWikiBlock([])).toBe("")
  })

  it("renders a positioning page as a labeled section", () => {
    const block = formatIpWikiBlock([
      makeRow({ pageType: "positioning", title: "AI营销实战派", content: "帮中小老板用 AI 搞流量" }),
    ])
    expect(block).toContain("IP 定位维基")
    expect(block).toContain("【定位主张】AI营销实战派")
    expect(block).toContain("帮中小老板用 AI 搞流量")
  })

  it("renders content_strategy frontmatter fields as actionable strategy summary", () => {
    const block = formatIpWikiBlock([
      makeRow({
        pageType: "content_strategy",
        title: "内容策略底盘",
        content: "整体策略说明",
        frontmatter: {
          topicDistribution: [{ topic: "AI工具教程", percentage: 40 }, { topic: "老板故事", percentage: 30 }],
          contentFormats: [{ format: "深度教程", percentage: 58 }],
          hookPatterns: ["痛点提问", "数字吸引"],
          postingFrequency: "每周 3-4 条",
          bestPostingTimes: "工作日 18:00-21:00",
          viralFormula: "高价值信息 + 实操 + 情绪",
        },
      }),
    ])
    expect(block).toContain("【内容策略底盘】内容策略底盘")
    expect(block).toContain("话题分布：AI工具教程 40%、老板故事 30%")
    expect(block).toContain("内容形式：深度教程 58%")
    expect(block).toContain("钩子模式：痛点提问、数字吸引")
    expect(block).toContain("发布频率：每周 3-4 条")
    expect(block).toContain("最佳时段：工作日 18:00-21:00")
    expect(block).toContain("爆款公式：高价值信息 + 实操 + 情绪")
    expect(block).toContain("整体策略说明")
  })

  it("orders pages by the fixed core reading order (positioning before content_strategy)", () => {
    const block = formatIpWikiBlock([
      makeRow({ pageType: "content_strategy", title: "底盘", content: "B" }),
      makeRow({ pageType: "positioning", title: "定位", content: "A" }),
    ])
    const posIdx = block.indexOf("【定位主张】")
    const stratIdx = block.indexOf("【内容策略底盘】")
    expect(posIdx).toBeGreaterThan(-1)
    expect(stratIdx).toBeGreaterThan(-1)
    expect(posIdx).toBeLessThan(stratIdx)
  })

  it("ignores non-core page types like index/log", () => {
    const block = formatIpWikiBlock([
      makeRow({ pageType: "index", title: "目录", content: "不应出现" }),
      makeRow({ pageType: "positioning", title: "定位", content: "应出现" }),
    ])
    expect(block).not.toContain("不应出现")
    expect(block).toContain("应出现")
  })

  it("tolerates malformed frontmatter without throwing", () => {
    expect(() =>
      formatIpWikiBlock([
        makeRow({
          pageType: "content_strategy",
          title: "底盘",
          content: "x",
          frontmatter: { topicDistribution: "not-an-array", hooks: 123 } as unknown,
        }),
      ])
    ).not.toThrow()
  })
})

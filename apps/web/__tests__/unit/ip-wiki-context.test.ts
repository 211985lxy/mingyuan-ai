import { describe, expect, it } from "vitest"
import { formatFallbackPositioningBlock, formatIpWikiBlock } from "@/lib/ip-wiki/context"
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

  it("keeps a project-adapted methodology page explicitly customer-scoped", () => {
    const block = formatIpWikiBlock([
      makeRow({ pageType: "viral_methodology", title: "相宇原创 IP 方法", content: "用于明远 AI 商业内容" }),
      makeRow({ pageType: "positioning", title: "客户定位", content: "项目专属信息" }),
    ])

    expect(block).toContain("【项目爆款策略（客户专属）】相宇原创 IP 方法")
    expect(block).toContain("用于明远 AI 商业内容")
    expect(block).toContain("客户定位")
    expect(block).toContain("项目专属信息")
  })

  it("tolerates malformed frontmatter without throwing", () => {
    expect(() =>
      formatIpWikiBlock([
        makeRow({
          pageType: "content_strategy",
          title: "底盘",
          content: "x",
          frontmatter: { topicDistribution: "not-an-array", hooks: 123 },
        }),
      ])
    ).not.toThrow()
  })
})

describe("formatFallbackPositioningBlock", () => {
  it("prioritizes positioning and product facts over private-domain material", () => {
    const block = formatFallbackPositioningBlock([
      { title: "私域话术", content: "低优先级承接", category: "private_domain_material" },
      { title: "核心定位", content: "帮助老板构建 AI 一人公司", category: "positioning_material" },
      { title: "核心产品", content: "IP 操盘服务", category: "product_usp" },
    ])

    expect(block).toContain("IP Wiki 尚未编译")
    expect(block).toContain("业务定位、服务对象、价值主张和转化承接")
    expect(block.indexOf("核心定位")).toBeLessThan(block.indexOf("核心产品"))
    expect(block.indexOf("核心产品")).toBeLessThan(block.indexOf("私域话术"))
  })

  it("limits the fallback block to eight entries", () => {
    const block = formatFallbackPositioningBlock(
      Array.from({ length: 10 }, (_, index) => ({
        title: `定位资料${index + 1}`,
        content: "定位事实",
        category: "positioning_material",
        sortOrder: index,
      })),
    )

    expect(block).toContain("定位资料8")
    expect(block).not.toContain("定位资料9")
  })
})

describe("formatIpWikiBlock 公平分页（修复：卖点/人设不再被预算砍掉）", () => {
  it("七类档案页全部在场，每页有实质内容，总长不超预算", () => {
    const types = ["positioning", "persona", "content_strategy", "audience", "conversion_path", "topic_direction", "viral_methodology"] as const
    const block = formatIpWikiBlock(types.map((pageType) => makeRow({
      pageType,
      title: pageType,
      content: "字".repeat(1500), // 每页都远超均分预算
    })))
    expect(block.length).toBeLessThanOrEqual(3000)
    for (const label of ["定位主张", "人设", "内容策略底盘", "目标人群", "成交路径", "选题方向", "项目爆款策略（客户专属）"]) {
      expect(block).toContain(`【${label}】`)
    }
    // 每个分节都保住保底正文（200 字），不再出现只有标题没有内容的档案页
    const sections = block.split(/\n\n+/).filter((section) => section.startsWith("【"))
    expect(sections.length).toBe(7)
    for (const section of sections) {
      expect(section.replace(/^【[^】]+】.*\n/, "").length).toBeGreaterThanOrEqual(180)
    }
  })

  it("单页档案可用满近 2300 字，不再被 1200 字截半", () => {
    const block = formatIpWikiBlock([
      makeRow({ pageType: "positioning", title: "档案", content: "好".repeat(2600) }),
    ])
    expect(block).toContain("好".repeat(2000))
  })
})

import { describe, expect, it } from "vitest"
import {
  DATA_SOVEREIGNTY_COPY,
  PROJECT_EXPORT_LIMITS,
  buildProjectDataExport,
  exportFileName,
  renderProjectDataExportMarkdown,
  type ProjectExportSource,
} from "@/lib/aim/project-data-export"

function source(overrides: Partial<ProjectExportSource> = {}): ProjectExportSource {
  return {
    project: {
      id: "proj-1",
      name: "明远咨询",
      companyName: "明动",
      industry: "咨询",
      targetCustomer: "老板",
      offer: "内容增长",
      deliveryGoal: "出片",
    },
    generations: [{
      id: "gen-1",
      topicTitle: "第一条选题",
      agentId: "content_producer",
      workflowStatus: "published",
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      publishPlatform: "douyin",
      publishUrl: "https://example.com/v/1",
      videoScript: "口播正文",
      wechatArticle: null,
      createdAt: new Date("2026-08-30T00:00:00.000Z"),
    }],
    knowledge: [{
      id: "k-1",
      category: "boss_experience",
      title: "成交卡点",
      content: "客户最怕选错人",
      tags: ["成交"],
      valueGrade: "A",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    }],
    outcomes: [{
      id: "o-1",
      generationId: "gen-1",
      platform: "douyin",
      collectWindowDay: 7,
      views: 1200,
      likes: 30,
      comments: 4,
      saves: 8,
      shares: 2,
      collectedAt: new Date("2026-09-08T00:00:00.000Z"),
    }],
    wikiPages: [],
    assets: [{
      id: "a-1",
      name: "封面.png",
      assetType: "image",
      url: "https://cdn.example/cover.png",
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
    }],
    ...overrides,
  }
}

describe("项目数据导出", () => {
  it("快照含内容、知识、效果、素材引用，并带主权承诺", () => {
    const payload = buildProjectDataExport(source(), new Date("2026-09-12T00:00:00.000Z"))
    expect(payload.project.name).toBe("明远咨询")
    expect(payload.contents[0]?.excerpt).toBe("口播正文")
    expect(payload.knowledge[0]?.title).toBe("成交卡点")
    expect(payload.outcomes[0]?.views).toBe(1200)
    expect(payload.materialRefs[0]?.scope).toBe("account")
    expect(payload.sovereignty).toEqual(DATA_SOVEREIGNTY_COPY)
    expect(JSON.stringify(payload)).not.toMatch(/embedding|jwt|secret|apiKey/i)
  })

  it("超限时截断并记下没带走的条数", () => {
    const generations = Array.from({ length: PROJECT_EXPORT_LIMITS.generations + 3 }, (_, index) => ({
      id: `gen-${index}`,
      topicTitle: `题 ${index}`,
      agentId: null,
      workflowStatus: "draft",
      publishedAt: null,
      publishPlatform: null,
      publishUrl: null,
      videoScript: "x".repeat(PROJECT_EXPORT_LIMITS.contentChars + 20),
      wechatArticle: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    }))
    const payload = buildProjectDataExport(source({ generations }))
    expect(payload.counts.generations).toBe(PROJECT_EXPORT_LIMITS.generations)
    expect(payload.truncated.generations).toBe(3)
    expect(payload.contents[0]?.excerpt.includes("已截断")).toBe(true)
  })

  it("Markdown 含承诺文案和素材按账号存储的说明", () => {
    const payload = buildProjectDataExport(source())
    const markdown = renderProjectDataExportMarkdown(payload)
    expect(markdown).toContain(DATA_SOVEREIGNTY_COPY.title)
    expect(markdown).toContain("不把它们卖给第三方")
    expect(markdown).toContain("素材按账号存储")
    expect(markdown).toContain("成交卡点")
    expect(exportFileName("明远咨询", "md", new Date("2026-09-12T00:00:00.000Z"))).toBe("project-aim-export-2026-09-12.md")
    expect(exportFileName("Acme IP", "json", new Date("2026-09-12T00:00:00.000Z"))).toBe("Acme_IP-aim-export-2026-09-12.json")
  })
})

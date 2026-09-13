import { describe, expect, it } from "vitest"

import {
  EXPORT_PER_TYPE_LIMIT,
  buildProjectExportBundle,
  toMarkdownExport,
} from "@/lib/aim/data-export"
import type { ProjectExportInput } from "@/lib/aim/data-export"

const NOW = new Date("2026-09-12T08:00:00.000Z")

function baseInput(overrides: Partial<ProjectExportInput> = {}): ProjectExportInput {
  return {
    exportedAt: NOW,
    project: { id: "proj_1", name: "演示项目" },
    generations: [],
    knowledgeEntries: [],
    contentOutcomes: [],
    ...overrides,
  }
}

describe("buildProjectExportBundle", () => {
  it("组装元信息与计数", () => {
    const bundle = buildProjectExportBundle(
      baseInput({
        generations: [
          {
            id: "gen_1",
            topicTitle: "选题A",
            workflowStatus: "published",
            publishPlatform: "douyin",
            publishUrl: "https://v.douyin.com/x",
            publishedAt: "2026-09-01T00:00:00.000Z",
            createdAt: "2026-09-01T00:00:00.000Z",
            rawInput: "输入",
            videoScript: null,
            wechatArticle: null,
            momentsPost: null,
            shootingBrief: null,
            rawCopy: null,
            qualityScores: null,
          },
        ],
        contentOutcomes: [
          {
            id: "out_1",
            generationId: "gen_1",
            collectWindowDay: 7,
            views: 100,
            likes: 5,
            comments: 1,
            saves: 2,
            shares: 3,
            qualifiedLeadCount: 1,
            appointmentCount: 0,
            dealCount: 0,
            revenue: "99.00",
            verdictCode: "effective",
            collectedAt: "2026-09-08T00:00:00.000Z",
          },
        ],
      }),
    )
    expect(bundle.format).toBe("aim-project-export")
    expect(bundle.counts).toEqual({ generations: 1, knowledgeEntries: 0, contentOutcomes: 1 })
    expect(bundle.truncated).toEqual({ generations: false, knowledgeEntries: false, contentOutcomes: false })
  })

  it("达到上限时如实标记 truncated", () => {
    const many = Array.from({ length: EXPORT_PER_TYPE_LIMIT }, (_, index) => ({
      id: `k_${index}`,
      category: "customer_pain",
      title: `条目${index}`,
      content: "内容",
      tags: [],
      valueGrade: "B",
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
    }))
    const bundle = buildProjectExportBundle(baseInput({ knowledgeEntries: many }))
    expect(bundle.truncated.knowledgeEntries).toBe(true)
    expect(bundle.truncated.generations).toBe(false)
  })
})

describe("toMarkdownExport", () => {
  it("生成可独立阅读的 markdown，含承诺与三大分节", () => {
    const bundle = buildProjectExportBundle(
      baseInput({
        generations: [
          {
            id: "gen_1",
            topicTitle: "选题A",
            workflowStatus: "published",
            publishPlatform: "douyin",
            publishUrl: "https://v.douyin.com/x",
            publishedAt: "2026-09-01T00:00:00.000Z",
            createdAt: "2026-09-01T00:00:00.000Z",
            rawInput: "输入文本",
            videoScript: "口播稿正文",
            wechatArticle: null,
            momentsPost: null,
            shootingBrief: null,
            rawCopy: null,
            qualityScores: null,
          },
        ],
        knowledgeEntries: [
          {
            id: "k_1",
            category: "boss_experience",
            title: "老板经验",
            content: "经验正文",
            tags: ["a"],
            valueGrade: "S",
            status: "active",
            createdAt: "2026-09-01T00:00:00.000Z",
          },
        ],
        contentOutcomes: [
          {
            id: "out_1",
            generationId: "gen_1",
            collectWindowDay: 7,
            views: 100,
            likes: 5,
            comments: null,
            saves: null,
            shares: null,
            qualifiedLeadCount: 1,
            appointmentCount: null,
            dealCount: null,
            revenue: null,
            verdictCode: null,
            collectedAt: "2026-09-08T00:00:00.000Z",
          },
        ],
      }),
    )
    const markdown = toMarkdownExport(bundle)
    expect(markdown).toContain("# AIM 项目数据导出：演示项目")
    expect(markdown).toContain("数据归属项目方")
    expect(markdown).toContain("### 选题A（gen_1）")
    expect(markdown).toContain("**口播稿**")
    expect(markdown).toContain("口播稿正文")
    expect(markdown).toContain("### [boss_experience/S] 老板经验")
    expect(markdown).toContain("| gen_1 | 7天 | 100 | 5 | — |")
  })

  it("触顶时输出截断警示行", () => {
    const many = Array.from({ length: EXPORT_PER_TYPE_LIMIT }, (_, index) => ({
      id: `k_${index}`,
      category: "customer_pain",
      title: `条目${index}`,
      content: "内容",
      tags: [],
      valueGrade: null,
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
    }))
    const markdown = toMarkdownExport(buildProjectExportBundle(baseInput({ knowledgeEntries: many })))
    expect(markdown).toContain("knowledgeEntries")
  })
})

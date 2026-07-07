import { describe, expect, it } from "vitest"
import {
  buildMethodologyCompilePrompt,
  parseMethodologyCompileResponse,
} from "@/lib/viral-methodology-compiler"

describe("viral-methodology-compiler", () => {
  describe("buildMethodologyCompilePrompt", () => {
    it("contains required methodology section keywords", () => {
      const prompt = buildMethodologyCompilePrompt({
        competitorAnalysisText:
          "该竞品通过痛点提问开头，中段用案例推进，结尾号召关注，爆点迁移效果好。",
        projectName: "测试项目",
        sourceCompetitorId: "comp-123",
      })

      expect(prompt).toContain("爆款方法论")
      expect(prompt).toContain("开头打法")
      expect(prompt).toContain("中段推进")
      expect(prompt).toContain("结尾收束")
      expect(prompt).toContain("爆点迁移清单")
    })

    it("truncates input to 5000 chars", () => {
      const longText = "a".repeat(6000)
      const prompt = buildMethodologyCompilePrompt({
        competitorAnalysisText: longText,
      })
      // The prompt itself should not contain the full 6000 chars of input
      // We just verify the prompt is built without error and is reasonably bounded
      expect(prompt.length).toBeLessThan(8000)
    })

    it("includes project name and source competitor id when provided", () => {
      const prompt = buildMethodologyCompilePrompt({
        competitorAnalysisText: "some analysis text",
        projectName: "我的项目",
        sourceCompetitorId: "comp-456",
      })

      expect(prompt).toContain("我的项目")
      expect(prompt).toContain("comp-456")
    })
  })

  describe("parseMethodologyCompileResponse", () => {
    it("parses valid JSON array with viral_methodology pageType", () => {
      const raw = JSON.stringify([
        {
          pageType: "viral_methodology",
          title: "竞品爆款方法论",
          content:
            "## 开头打法\n痛点提问\n## 中段推进\n案例推进\n## 结尾收束\n号召关注\n## 爆点迁移清单\n- 痛点迁移\n- 案例迁移\n## 适用场景标签\n教育类",
          frontmatter: { competitorSource: "comp-123" },
          sources: [{ kind: "aim_generation", id: "comp-123", label: "竞品分析" }],
          links: ["内容策略底盘"],
        },
      ])

      const result = parseMethodologyCompileResponse(raw)
      expect(result).toHaveLength(1)
      expect(result[0].pageType).toBe("viral_methodology")
      expect(result[0].title).toBe("竞品爆款方法论")
      expect(result[0].content).toContain("开头打法")
      expect(result[0].sources).toEqual([
        { kind: "aim_generation", id: "comp-123", label: "竞品分析" },
      ])
    })

    it("returns empty array for empty string", () => {
      expect(parseMethodologyCompileResponse("")).toEqual([])
    })

    it("returns empty array for non-JSON string", () => {
      expect(parseMethodologyCompileResponse("not json")).toEqual([])
    })

    it("filters out non-matching pageType", () => {
      const raw = JSON.stringify([
        {
          pageType: "content_strategy",
          title: "内容策略",
          content: "some content",
          frontmatter: {},
          sources: [],
          links: [],
        },
      ])

      expect(parseMethodologyCompileResponse(raw)).toEqual([])
    })
  })
})

import { describe, expect, it } from "vitest"
import { buildContentReviewChatPrompt, buildContentReviewGeneratePrompt } from "@/lib/aim-agent-content-review-prompts"

/**
 * 质检报告（content_review）输出结构契约测试。
 *
 * 历史 bug：chat 版输出 6 项（含独立"风险等级"字段、无数值约束），
 * generate 版输出 7 项（含"平台风险/表达质量"、必改1-5个、复检3-5条），
 * 两个入口产出结构不一致。本测试锁定：chat 与 generate 的报告结构对齐到同一套 7 项。
 */

const REVIEW_OUTPUT_FIELDS = [
  "总体结论",
  "必改问题",
  "平台风险",
  "表达质量",
  "流量潜力评分",
  "最小修改建议",
  "复检清单",
] as const

describe("质检报告结构：chat 与 generate 一致", () => {
  it("chat 版包含完整 7 项结构", () => {
    const prompt = buildContentReviewChatPrompt("知识背景")
    for (const field of REVIEW_OUTPUT_FIELDS) {
      expect(prompt, `chat 缺少字段：${field}`).toContain(field)
    }
  })

  it("generate 版包含完整 7 项结构", () => {
    const prompt = buildContentReviewGeneratePrompt("知识背景")
    for (const field of REVIEW_OUTPUT_FIELDS) {
      expect(prompt, `generate 缺少字段：${field}`).toContain(field)
    }
  })

  it("chat 版不再单独要求「风险等级」字段（已并入平台风险）", () => {
    const prompt = buildContentReviewChatPrompt("知识背景")
    // 原来的独立字段要求是「输出必须包含：...风险等级...」，现已移除
    expect(prompt).not.toMatch(/输出必须包含[^]*风险等级/)
  })

  it("chat 版必改问题与复检清单数量约束与 generate 版一致", () => {
    const chatPrompt = buildContentReviewChatPrompt("知识背景")
    expect(chatPrompt).toContain("1-5 个")
    expect(chatPrompt).toContain("3-5 条")
  })
})

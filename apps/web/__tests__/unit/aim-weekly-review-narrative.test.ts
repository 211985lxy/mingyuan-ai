import { describe, expect, it, vi } from "vitest"

import {
  buildNarrativePrompt,
  buildWeeklyFactsMarkdown,
  generateWeeklyNarrative,
  hasWeeklyReviewData,
  type WeeklyNarrativeLlm,
} from "@/lib/aim/weekly-review-narrative"
import type { WeeklyReviewMetrics } from "@/lib/aim/weekly-review"
import type { TaskAttributionInsight } from "@/lib/aim/attribution-insights"

vi.mock("@/lib/llm/client", () => ({
  LLMClient: { shared: vi.fn(() => { throw new Error("测试不应触达默认 LLM") }) },
}))

function review(overrides: Partial<WeeklyReviewMetrics> = {}): WeeklyReviewMetrics {
  return {
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-09-08T00:00:00.000Z",
    publishedCount: 4,
    qualifiedLeadCount: 6,
    appointmentCount: 2,
    dealCount: 1,
    revenue: 3980,
    referencedAssetCount: 8,
    reusedAssetCount: 3,
    day7Backfill: { due: 3, filled: 2 },
    ...overrides,
  }
}

const INSIGHTS: TaskAttributionInsight[] = [
  {
    contentTask: "推动咨询行动",
    publishedCount: 2,
    viewsTotal: 5200,
    traceableLeadCount: 4,
    unknownLeadCount: 1,
    sampleNote: null,
  },
]

function llmStub(content: string, finishReason: string | null = "stop"): WeeklyNarrativeLlm {
  return { complete: vi.fn(async () => ({ content, finishReason })) }
}

describe("buildWeeklyFactsMarkdown（事实段与 JSON 一致）", () => {
  it("逐条引用数字，含归因行与口径说明", () => {
    const facts = buildWeeklyFactsMarkdown({ review: review(), taskInsights: INSIGHTS })
    expect(facts).toContain("发布内容：4 条")
    expect(facts).toContain("有效线索：6 条")
    expect(facts).toContain("收入：¥3980")
    expect(facts).toContain("第 7 天回填率：67%（2/3）")
    expect(facts).toContain("推动咨询行动：发布 2 条｜播放合计 5,200｜可追溯线索 4 条｜来源不明 1 条")
    expect(facts).toContain("空值不代表 0")
  })

  it("播放未回填显示「未回填」，不显示 0", () => {
    const facts = buildWeeklyFactsMarkdown({
      review: review(),
      taskInsights: [{ ...INSIGHTS[0], viewsTotal: null }],
    })
    expect(facts).toContain("播放合计 未回填")
    expect(facts).not.toContain("播放合计 0")
  })
})

describe("generateWeeklyNarrative（四段式周报）", () => {
  it("验收①：产物事实段数字与 JSON 完全一致（LLM 只补后三段）", async () => {
    const llm = llmStub(["## 二、基于数据的判断", "线索集中在咨询类。", "## 三、暂时不能确定的原因", "因果待验证。", "## 四、下一轮建议", "继续同类选题。"].join("\n"))
    const result = await generateWeeklyNarrative(
      { review: review(), taskInsights: INSIGHTS },
      { llm, now: () => new Date("2026-09-08T00:00:00.000Z") },
    )
    expect(result.source).toBe("llm")
    expect(result.markdown).toContain("## 一、已确认的数据事实")
    expect(result.markdown).toContain("有效线索：6 条")
    expect(result.markdown).toContain("成交：1 单")
    expect(result.markdown).toContain("## 二、基于数据的判断")
    expect(result.markdown).toContain("必须人工审核")
  })

  it("验收②：全空数据周不出假报告，且不调用 LLM", async () => {
    const llm = { complete: vi.fn() }
    const result = await generateWeeklyNarrative(
      { review: review({ publishedCount: 0, qualifiedLeadCount: 0, appointmentCount: 0, dealCount: 0, revenue: 0, referencedAssetCount: 0, reusedAssetCount: 0, day7Backfill: { due: 0, filled: 0 } }), taskInsights: [] },
      { llm: llm as unknown as WeeklyNarrativeLlm, now: () => new Date("2026-09-08T00:00:00.000Z") },
    )
    expect(result.source).toBe("empty")
    expect(result.markdown).toContain("本周期无已回填数据")
    expect(result.markdown).toContain("不编造结论")
    expect(llm.complete).not.toHaveBeenCalled()
  })

  it("验收③：样本不足周的建议段包含「继续积累数据」", async () => {
    const llm = llmStub("缺标题") // 触发模板回退
    const result = await generateWeeklyNarrative(
      { review: review({ publishedCount: 1 }), taskInsights: [{ ...INSIGHTS[0], sampleNote: "样本不足（2 条），仅列事实，不下结论" }] },
      { llm, now: () => new Date("2026-09-08T00:00:00.000Z") },
    )
    expect(result.source).toBe("template")
    expect(result.fallbackReason).toContain("缺少必需段落标题")
    expect(result.markdown).toContain("继续积累数据")
    expect(result.markdown).toContain("只描述现象")
  })

  it("LLM 输出被截断（finishReason=length）时回退模板并如实标注", async () => {
    const llm = llmStub(["## 二、基于数据的判断", "…", "## 三、暂时不能确定的原因", "…", "## 四、下一轮建议", "…"].join("\n"), "length")
    const result = await generateWeeklyNarrative(
      { review: review(), taskInsights: INSIGHTS },
      { llm, now: () => new Date("2026-09-08T00:00:00.000Z") },
    )
    expect(result.source).toBe("template")
    expect(result.fallbackReason).toContain("截断")
  })

  it("LLM 抛错时回退模板，事实段仍完整", async () => {
    const llm = { complete: vi.fn(async () => { throw new Error("provider 不可用") }) }
    const result = await generateWeeklyNarrative(
      { review: review(), taskInsights: [] },
      { llm: llm as unknown as WeeklyNarrativeLlm, now: () => new Date("2026-09-08T00:00:00.000Z") },
    )
    expect(result.source).toBe("template")
    expect(result.fallbackReason).toBe("provider 不可用")
    expect(result.markdown).toContain("有效线索：6 条")
  })
})

describe("提示词纪律", () => {
  it("小样本时提示词强制「继续积累数据」，并只许引用事实段数字", () => {
    const input = { review: review({ publishedCount: 1 }), taskInsights: [] }
    const prompt = buildNarrativePrompt(input, buildWeeklyFactsMarkdown(input))
    expect(prompt).toContain("继续积累数据")
    expect(prompt).toContain("禁止编造")
    expect(prompt).toContain("相关不等于因果")
    expect(prompt).toContain("只输出以下三段")
  })

  it("hasWeeklyReviewData 边界", () => {
    expect(hasWeeklyReviewData({ review: review({ publishedCount: 0, qualifiedLeadCount: 0, appointmentCount: 0, dealCount: 0, revenue: 0, referencedAssetCount: 0, reusedAssetCount: 0, day7Backfill: { due: 0, filled: 0 } }), taskInsights: [] })).toBe(false)
    expect(hasWeeklyReviewData({ review: review({ publishedCount: 0, qualifiedLeadCount: 0, appointmentCount: 0, dealCount: 0, revenue: 0, referencedAssetCount: 0, reusedAssetCount: 0, day7Backfill: { due: 2, filled: 0 } }), taskInsights: [] })).toBe(true)
    expect(hasWeeklyReviewData({ review: review(), taskInsights: INSIGHTS })).toBe(true)
  })
})

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AimQualityReport } from "@/components/aim/aim-quality-report"
import type { QualityCheckReport } from "@/lib/api/client"

describe("AimQualityReport", () => {
  it("renders quality, publishing risk and the smallest rewrite", () => {
    const dimension = { score: 75, passed: false, feedback: "需要优化" }
    const report = {
      overall: { score: 75, passed: false, needsRewrite: true },
      rewriteCount: 0,
      attraction: dimension,
      logic: dimension,
      aiTaste: dimension,
      editorial: dimension,
      publishCheck: {
        verdict: "改完可发",
        violations: [{
          text: "保证收益",
          category: "夸大承诺",
          severity: "high",
          reason: "不可验证",
          suggest: "改为条件说明",
          ruleId: "R03",
          evidence: "收益承诺绑定转化",
        }],
        trafficScore: { score: 68, level: "中", reasons: ["开头不够具体"] },
        aiLabelReminder: "发布时按平台规则标识",
        trafficWeakness: ["缺少场景"],
        minimalRewrite: "在对应条件下可能获得改善。",
        disclaimer: "本检查只覆盖可见表达风险，不承诺平台一定过审。",
        recheckHint: "改完后请再点一次「发布前自查」做复检。",
      },
    } satisfies QualityCheckReport
    const html = renderToStaticMarkup(createElement(AimQualityReport, { report }))

    expect(html).toContain("75分")
    expect(html).toContain("改完可发")
    expect(html).toContain("保证收益")
    expect(html).toContain("R03")
    expect(html).toContain("不承诺平台一定过审")
    expect(html).toContain("开头不够具体")
    expect(html).toContain("在对应条件下可能获得改善")
    expect(html).toContain("再点一次")
  })

  it("renders advisory violations with softer label", () => {
    const dimension = { score: 80, passed: true, feedback: "可用" }
    const report = {
      overall: { score: 80, passed: true, needsRewrite: false },
      rewriteCount: 0,
      attraction: dimension,
      logic: dimension,
      aiTaste: dimension,
      editorial: dimension,
      publishCheck: {
        verdict: "可发",
        violations: [{
          text: "神器",
          category: "知识类虚假宣传",
          severity: "low",
          reason: "仅提示",
          suggest: "可降调",
          ruleId: "R06",
          advisory: true,
        }],
        trafficScore: { score: 80, level: "高", reasons: ["较完整"] },
        aiLabelReminder: "按需标注",
        trafficWeakness: [],
        minimalRewrite: "原文",
        disclaimer: "本检查只覆盖可见表达风险，不承诺平台一定过审。",
      },
    } satisfies QualityCheckReport
    const html = renderToStaticMarkup(createElement(AimQualityReport, { report }))
    expect(html).toContain("仅提示")
    expect(html).toContain("R06")
  })
})

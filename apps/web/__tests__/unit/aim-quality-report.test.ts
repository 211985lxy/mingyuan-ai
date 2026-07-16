import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AimQualityReport } from "@/components/aim/aim-quality-report"
import type { QualityCheckReport } from "@/lib/api/client"

describe("AimQualityReport", () => {
  it("renders quality, publishing risk and the smallest rewrite", () => {
    const dimension = { score: 75, passed: false, feedback: "需要优化" }
    const report = {
      overall: { score: 75, passed: false },
      attraction: dimension,
      logic: dimension,
      aiTaste: dimension,
      editorial: dimension,
      publishCheck: {
        verdict: "修改后可发",
        violations: [{ text: "保证收益", category: "夸大承诺", severity: "high", reason: "不可验证", suggest: "改为条件说明" }],
        trafficScore: { score: 68, level: "一般", reasons: ["开头不够具体"] },
        aiLabelReminder: "发布时按平台规则标识",
        trafficWeakness: ["缺少场景"],
        minimalRewrite: "在对应条件下可能获得改善。",
      },
    } as QualityCheckReport
    const html = renderToStaticMarkup(createElement(AimQualityReport, { report }))

    expect(html).toContain("75分")
    expect(html).toContain("修改后可发")
    expect(html).toContain("保证收益")
    expect(html).toContain("开头不够具体")
    expect(html).toContain("在对应条件下可能获得改善")
  })
})

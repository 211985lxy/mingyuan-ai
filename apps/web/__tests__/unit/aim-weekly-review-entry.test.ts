import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { WeeklyBusinessReview } from "@/features/aim/components/weekly-business-review"

const REVIEW = {
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-09-08T00:00:00.000Z",
  publishedCount: 3,
  qualifiedLeadCount: 5,
  appointmentCount: 1,
  dealCount: 1,
  revenue: 2980,
  referencedAssetCount: 6,
  reusedAssetCount: 2,
  day7Backfill: { due: 2, filled: 2 },
}

describe("WeeklyBusinessReview · 月报与四段式入口（WP-E/WP-D 收尾）", () => {
  it("monthlyReportHref 渲染「本月经营月报」入口且新标签打开", () => {
    const html = renderToStaticMarkup(createElement(WeeklyBusinessReview, {
      review: REVIEW,
      monthlyReportHref: "/api/aim/reports/monthly?projectId=proj-1",
    }))
    expect(html).toContain("本月经营月报")
    expect(html).toContain('href="/api/aim/reports/monthly?projectId=proj-1"')
    expect(html).toContain('target="_blank"')
  })

  it("未传 href 时不渲染入口（旧调用方零影响）", () => {
    const html = renderToStaticMarkup(createElement(WeeklyBusinessReview, { review: REVIEW }))
    expect(html).not.toContain("本月经营月报")
  })

  it("narrative enabled=false 时不渲染四段式折叠区", () => {
    const html = renderToStaticMarkup(createElement(WeeklyBusinessReview, {
      review: REVIEW,
      narrative: { enabled: false },
    }))
    expect(html).not.toContain("四段式周报")
  })

  it("narrative 有内容时折叠区标注人审红线与回退原因", () => {
    const html = renderToStaticMarkup(createElement(WeeklyBusinessReview, {
      review: REVIEW,
      narrative: {
        enabled: true,
        source: "template",
        markdown: "## 一、已确认的数据事实",
        generatedAt: "2026-09-08T00:00:00.000Z",
        fallbackReason: "LLM 输出缺少必需段落标题",
      },
    }))
    expect(html).toContain("四段式周报")
    expect(html).toContain("必须人工审核")
    expect(html).toContain("模板初稿")
    expect(html).toContain("LLM 输出缺少必需段落标题")
  })
})

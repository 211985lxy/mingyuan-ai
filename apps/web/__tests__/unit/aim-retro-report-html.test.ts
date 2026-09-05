import { describe, expect, it } from "vitest"

import {
  escapeHtml,
  formatMetric,
  renderRetroReportHtml,
  type RetroReportData,
} from "@/lib/aim/retro-report-html"

function baseData(overrides: Partial<RetroReportData> = {}): RetroReportData {
  return {
    generation: {
      id: "gen-1",
      topicTitle: "测试选题",
      rawInput: "原始输入",
      workflowStatus: "published",
      publishPlatform: "douyin",
      publishUrl: "https://example.com/p/1",
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      createdAt: new Date("2026-08-30T00:00:00.000Z"),
    },
    outcomes: [],
    attributions: [],
    retroSnapshots: [],
    generatedAt: new Date("2026-09-05T00:00:00.000Z"),
    ...overrides,
  }
}

describe("renderRetroReportHtml（HTML 复盘报告展示层）", () => {
  it("空数据：三段都显式说明缺数据，不出现假数字", () => {
    const html = renderRetroReportHtml(baseData())
    expect(html).toContain("尚无已回填的发布数据")
    expect(html).toContain("未登记线索归因")
    expect(html).toContain("尚未生成复盘结论")
  })

  it("三窗口数据渲染且空值≠0（未回填不显示为 0）", () => {
    const html = renderRetroReportHtml(
      baseData({
        outcomes: [
          {
            collectWindowDay: 7,
            collectedAt: new Date("2026-09-08T00:00:00.000Z"),
            platform: "douyin",
            views: 1200,
            likes: 0,
            comments: null,
            saves: null,
            shares: null,
            qualifiedCommentCount: null,
            dmCount: null,
            qualifiedLeadCount: null,
            appointmentCount: null,
            dealCount: null,
            revenue: null,
            verdictCode: "effective",
            verdictNote: "带来咨询",
            audienceFeedback: null,
          },
        ],
      }),
    )
    expect(html).toContain("第 7 天（累计快照）")
    expect(html).toContain("1,200")
    expect(html).toMatch(/<td>0<\/td>/) // 合法 0 显示 0
    expect(html).toContain("未回填") // 空值显示未回填
    expect(html).toContain("累计快照，不相加") // 页脚纪律声明
  })

  it("归因列表渲染，unknown 显示为「来源不明」不美化", () => {
    const html = renderRetroReportHtml(
      baseData({
        attributions: [
          {
            externalLeadId: "wx_lead_1",
            attributionMethod: "explicit",
            externalDealId: "deal_9",
            externalPaymentId: null,
            occurredAt: new Date("2026-09-03T00:00:00.000Z"),
          },
          {
            externalLeadId: "wx_lead_2",
            attributionMethod: "unknown",
            externalDealId: null,
            externalPaymentId: null,
            occurredAt: new Date("2026-09-04T00:00:00.000Z"),
          },
        ],
      }),
    )
    expect(html).toContain("明确归因")
    expect(html).toContain("来源不明")
    expect(html).toContain("wx_lead_1")
  })

  it("标题与所有文本字段做 HTML 转义，防注入", () => {
    const html = renderRetroReportHtml(
      baseData({
        generation: {
          ...baseData().generation,
          topicTitle: '<script>alert(1)</script>',
          publishUrl: 'https://e.com/a"onmouseover="x',
        },
        retroSnapshots: [
          { summary: "<img src=x onerror=alert(2)>", createdAt: "2026-09-04T00:00:00.000Z" },
        ],
      }),
    )
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<img src=x")
    expect(html).not.toContain('<a href="https://e.com/a"onmouseover')
  })

  it("复盘快照按四段式字段渲染，最新在前", () => {
    const html = renderRetroReportHtml(
      baseData({
        retroSnapshots: [
          { summary: "第一次复盘", createdAt: "2026-09-02T00:00:00.000Z" },
          { summary: "第二次复盘", actualData: "播放 5000", verdict: "选题有效", nextRule: "继续同类选题", createdAt: "2026-09-09T00:00:00.000Z" },
        ],
      }),
    )
    expect(html).toContain("第 2 次复盘")
    expect(html.indexOf("第二次复盘")).toBeLessThan(html.indexOf("第一次复盘"))
    expect(html).toContain("下一步规则")
  })

  it("formatMetric：null 未回填 / 0 为 0 / 数字千分位", () => {
    expect(formatMetric(null)).toContain("未回填")
    expect(formatMetric(undefined)).toContain("未回填")
    expect(formatMetric(0)).toBe("0")
    expect(formatMetric(12345)).toBe("12,345")
  })

  it("escapeHtml 覆盖五类危险字符", () => {
    expect(escapeHtml(`<a href="x" class='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    )
  })
})

import { describe, expect, it } from "vitest"

import {
  computeMonthlyOperatingReport,
  parseMonthString,
  pickMatureSnapshots,
  type MonthlyReportOutcomeRow,
} from "@/lib/aim/monthly-report"
import { renderMonthlyReportHtml } from "@/lib/aim/monthly-report-html"

const SEP = { start: new Date("2026-09-01T00:00:00.000Z"), end: new Date("2026-10-01T00:00:00.000Z") }

function outcomeRow(overrides: Partial<MonthlyReportOutcomeRow>): MonthlyReportOutcomeRow {
  return {
    generationId: "gen-1",
    collectWindowDay: 7,
    collectedAt: new Date("2026-09-10T00:00:00.000Z"),
    views: null,
    qualifiedLeadCount: null,
    appointmentCount: null,
    dealCount: null,
    revenue: null,
    ...overrides,
  }
}

describe("parseMonthString", () => {
  it("合法月份", () => {
    expect(parseMonthString("2026-09")).toEqual({ ...SEP, month: "2026-09" })
  })
  it("非法月份", () => {
    expect(parseMonthString("2026-13")).toBeNull()
    expect(parseMonthString("2026/09")).toBeNull()
    expect(parseMonthString("")).toBeNull()
  })
})

describe("pickMatureSnapshots（30>14>7，不相加）", () => {
  it("同一条内容多窗口只取最成熟一档", () => {
    const picked = pickMatureSnapshots(
      [
        outcomeRow({ generationId: "g1", collectWindowDay: 7, views: 100 }),
        outcomeRow({ generationId: "g1", collectWindowDay: 14, views: 200 }),
        outcomeRow({ generationId: "g1", collectWindowDay: 30, views: 500 }),
      ],
      SEP.end,
    )
    expect(picked.get("g1")?.views).toBe(500)
  })

  it("窗口末之后采集的快照不计入（collectedAt >= end 排除）", () => {
    const picked = pickMatureSnapshots(
      [outcomeRow({ generationId: "g1", collectedAt: new Date("2026-10-02T00:00:00.000Z"), views: 999 })],
      SEP.end,
    )
    expect(picked.size).toBe(0)
  })

  it("只有 7 天窗口时取 7 天", () => {
    const picked = pickMatureSnapshots([outcomeRow({ generationId: "g1", collectWindowDay: 7, views: 80 })], SEP.end)
    expect(picked.get("g1")?.views).toBe(80)
  })
})

function buildStore(rows: {
  generations: Array<{ id: string; workflowStatus: string; publishedAt: Date | null; taskSpec: unknown }>
  outcomes: MonthlyReportOutcomeRow[]
  attributions: Array<{ generationId: string; attributionMethod: string }>
}) {
  return {
    aimGeneration: { findMany: async () => rows.generations },
    contentOutcome: {
      findMany: async (args?: { where?: { generationId?: { in?: string[] } } }) => {
        const ids = args?.where?.generationId?.in
        return ids ? rows.outcomes.filter((row) => ids.includes(row.generationId)) : rows.outcomes
      },
    },
    outcomeAttribution: {
      findMany: async (args?: { where?: { generationId?: { in?: string[] } } }) => {
        const ids = args?.where?.generationId?.in
        return ids ? rows.attributions.filter((row) => ids.includes(row.generationId)) : rows.attributions
      },
    },
  }
}

describe("computeMonthlyOperatingReport（WP-E 月度聚合）", () => {
  it("聚合、归因与数据缺口说明", async () => {
    const store = buildStore({
      generations: [
        { id: "g1", workflowStatus: "published", publishedAt: new Date("2026-09-05T00:00:00.000Z"), taskSpec: { contentTask: "推动咨询行动" } },
        { id: "g2", workflowStatus: "published", publishedAt: new Date("2026-09-20T00:00:00.000Z"), taskSpec: null },
        { id: "g3", workflowStatus: "published", publishedAt: new Date("2026-08-20T00:00:00.000Z"), taskSpec: null }, // 上月，排除
        { id: "g4", workflowStatus: "draft", publishedAt: null, taskSpec: null }, // 未发布，排除
      ],
      outcomes: [
        outcomeRow({ generationId: "g1", collectWindowDay: 7, views: 100 }),
        outcomeRow({ generationId: "g2", collectWindowDay: 7, views: 400 }),
        outcomeRow({ generationId: "g2", collectWindowDay: 30, views: 5000, dealCount: 2, revenue: 1280.5, qualifiedLeadCount: 3 }),
        outcomeRow({ generationId: "g3", collectWindowDay: 30, views: 9999 }), // 带外内容
      ],
      attributions: [
        { generationId: "g1", attributionMethod: "explicit" },
        { generationId: "g1", attributionMethod: "first_touch" },
        { generationId: "g2", attributionMethod: "unknown" },
        { generationId: "g3", attributionMethod: "explicit" }, // 带外
      ],
    })

    const report = await computeMonthlyOperatingReport({ userId: "u1", month: "2026-09", store })
    expect(report).not.toBeNull()
    expect(report!.publishedCount).toBe(2)
    expect(report!.backfilledCount).toBe(2)
    // g1 取 7 天(100)、g2 取 30 天(5000)：不相加、各取最成熟
    expect(report!.business.views).toBe(5100)
    expect(report!.business.dealCount).toBe(2)
    expect(report!.business.revenue).toBe(1280.5)
    expect(report!.business.qualifiedLeadCount).toBe(3)
    expect(report!.attribution).toEqual({ traceableLeadCount: 2, unknownLeadCount: 1 })
    // g3 的 9999 播放不得混入
    expect(report!.business.views).not.toBe(15099)
    expect(report!.taskInsights.length).toBeGreaterThan(0)
    expect(report!.dataNotes).toContainEqual(expect.stringContaining("样本不足"))
  })

  it("全空月份：零发布、空值≠0、不出假数", async () => {
    const store = buildStore({ generations: [], outcomes: [], attributions: [] })
    const report = await computeMonthlyOperatingReport({ userId: "u1", month: "2026-09", store })
    expect(report!.publishedCount).toBe(0)
    expect(report!.business.views).toBeNull()
    expect(report!.business.revenue).toBeNull()
    expect(report!.taskInsights).toEqual([])
    expect(report!.dataNotes).toEqual([])
  })

  it("部分内容未回填任何窗口 → dataNotes 明示", async () => {
    const store = buildStore({
      generations: [
        { id: "g1", workflowStatus: "published", publishedAt: new Date("2026-09-05T00:00:00.000Z"), taskSpec: null },
        { id: "g2", workflowStatus: "published", publishedAt: new Date("2026-09-06T00:00:00.000Z"), taskSpec: null },
        { id: "g3", workflowStatus: "published", publishedAt: new Date("2026-09-07T00:00:00.000Z"), taskSpec: null },
      ],
      outcomes: [outcomeRow({ generationId: "g1", collectWindowDay: 7, views: 50 })],
      attributions: [],
    })
    const report = await computeMonthlyOperatingReport({ userId: "u1", month: "2026-09", store })
    expect(report!.dataNotes).toContainEqual("2 条已发布内容未回填任何数据窗口")
    expect(report!.dataNotes).toContainEqual("商业指标仅覆盖 1/3 条内容，合计为已知部分")
  })

  it("非法月份返回 null", async () => {
    const store = buildStore({ generations: [], outcomes: [], attributions: [] })
    expect(await computeMonthlyOperatingReport({ userId: "u1", month: "bad", store })).toBeNull()
  })
})

describe("renderMonthlyReportHtml", () => {
  it("空值显示未回填、数据缺口上墙、样本标注", () => {
    const html = renderMonthlyReportHtml({
      projectName: '<script>坏项目</script>',
      generatedAt: new Date("2026-09-30T00:00:00.000Z"),
      report: {
        month: "2026-09",
        projectId: null,
        publishedCount: 2,
        backfilledCount: 1,
        business: {
          knownCount: 1,
          views: 1200,
          qualifiedLeadCount: null,
          appointmentCount: null,
          dealCount: 1,
          revenue: null,
        },
        attribution: { traceableLeadCount: 1, unknownLeadCount: 0 },
        taskInsights: [
          {
            contentTask: "推动咨询行动",
            publishedCount: 1,
            viewsTotal: null,
            traceableLeadCount: 1,
            unknownLeadCount: 0,
            sampleNote: "样本不足（1 条），仅列事实，不下结论",
          },
        ],
        dataNotes: ["1 条已发布内容未回填任何数据窗口"],
      },
    })
    expect(html).toContain("未回填")
    expect(html).toContain("1 条已发布内容未回填任何数据窗口")
    expect(html).toContain("样本不足")
    expect(html).not.toContain("<script>坏项目</script>")
    expect(html).toContain("不构成效果承诺")
  })
})

import { describe, expect, it } from "vitest"

import {
  computeCrossCustomerBenchmark,
  type BenchmarkAttributionRow,
  type BenchmarkGenerationRow,
  type BenchmarkOutcomeRow,
} from "@/lib/aim/benchmark-table"

interface BenchmarkStoreRows {
  generations: BenchmarkGenerationRow[]
  outcomes: BenchmarkOutcomeRow[]
  attributions: BenchmarkAttributionRow[]
}

const SEP = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") }

function buildStore(rows: BenchmarkStoreRows) {
  return {
    aimGeneration: { findMany: async () => rows.generations },
    contentOutcome: { findMany: async () => rows.outcomes },
    outcomeAttribution: { findMany: async () => rows.attributions },
  }
}

function gen(id: string, userId: string, taskSpec: unknown, publishedAt = "2026-08-10T00:00:00.000Z") {
  return { id, userId, workflowStatus: "published", publishedAt: new Date(publishedAt), taskSpec }
}

describe("computeCrossCustomerBenchmark（跨客户基准表 v0）", () => {
  it("单客户发布不足 3 条不进表，但仍计入活跃客户数", async () => {
    const store = buildStore({
      generations: [
        gen("g1", "u1", { contentTask: "推动咨询行动" }),
        gen("g2", "u1", { contentTask: "推动咨询行动" }),
        // u1 只有 2 条 → 不进表
      ],
      outcomes: [],
      attributions: [],
    })
    const result = await computeCrossCustomerBenchmark({ ...SEP, windowDays: 30, store })
    expect(result.activeCustomerCount).toBe(1)
    expect(result.rows).toEqual([])
    expect(result.disclaimer).toContain("仅内部参考，禁止对外")
  })

  it("跨客户按内容任务聚合：线索率/成交率、未标注排最后", async () => {
    const store = buildStore({
      generations: [
        gen("a1", "u1", { contentTask: "推动咨询行动" }),
        gen("a2", "u1", { contentTask: "推动咨询行动" }),
        gen("a3", "u1", { contentTask: "推动咨询行动" }),
        gen("b1", "u2", { contentTask: "推动咨询行动" }),
        gen("b2", "u2", { contentTask: "推动咨询行动" }),
        gen("b3", "u2", { contentTask: "推动咨询行动" }),
        gen("b4", "u2", null), // 未标注桶
        gen("b5", "u2", null),
        gen("b6", "u2", null),
      ],
      outcomes: [
        { generationId: "a1", collectWindowDay: 30, collectedAt: new Date("2026-08-31T00:00:00.000Z"), dealCount: 1, views: null, qualifiedLeadCount: null, appointmentCount: null, revenue: null },
        { generationId: "b1", collectWindowDay: 7, collectedAt: new Date("2026-08-20T00:00:00.000Z"), dealCount: 2, views: null, qualifiedLeadCount: null, appointmentCount: null, revenue: null },
      ],
      attributions: [
        { generationId: "a1", attributionMethod: "explicit" },
        { generationId: "a2", attributionMethod: "unknown" },
        { generationId: "b1", attributionMethod: "first_touch" },
      ],
    })
    const result = await computeCrossCustomerBenchmark({ ...SEP, windowDays: 30, store })
    expect(result.activeCustomerCount).toBe(2)
    const actionRow = result.rows.find((row) => row.contentTask === "推动咨询行动")
    expect(actionRow).toMatchObject({
      customerCount: 2,
      publishedCount: 6,
      traceableLeadCount: 2,
      unknownLeadCount: 1,
      dealCount: 3,
      leadRate: Math.round((2 / 6) * 10000) / 10000,
      dealRate: Math.round((3 / 6) * 10000) / 10000,
    })
    // 未标注固定最后
    expect(result.rows[result.rows.length - 1].contentTask).toBe("未标注")
    // 活跃客户 2 <5 → 每行都带小样本标注
    expect(actionRow?.sampleNote).toContain("样本不足")
    expect(result.disclaimer).toContain("禁止对外")
  })

  it("成交全未回填时 dealCount/dealRate 为 null（空值≠0）", async () => {
    const store = buildStore({
      generations: [gen("a1", "u1", { contentTask: "建立专业信任" }), gen("a2", "u1", { contentTask: "建立专业信任" }), gen("a3", "u1", { contentTask: "建立专业信任" })],
      outcomes: [
        { generationId: "a1", collectWindowDay: 7, collectedAt: new Date("2026-08-20T00:00:00.000Z"), dealCount: null, views: null, qualifiedLeadCount: null, appointmentCount: null, revenue: null },
      ],
      attributions: [],
    })
    const result = await computeCrossCustomerBenchmark({ ...SEP, windowDays: 30, store })
    const row = result.rows[0]
    expect(row.dealCount).toBeNull()
    expect(row.dealRate).toBeNull()
    expect(row.leadRate).toBe(0) // 0 条可追溯线索 / 3 发布 = 0（真零，非空值）
  })

  it("窗口外发布不计入", async () => {
    const store = buildStore({
      generations: [
        gen("a1", "u1", { contentTask: "推动咨询行动" }, "2026-07-15T00:00:00.000Z"),
        gen("a2", "u1", { contentTask: "推动咨询行动" }, "2026-07-16T00:00:00.000Z"),
        gen("a3", "u1", { contentTask: "推动咨询行动" }, "2026-07-17T00:00:00.000Z"),
      ],
      outcomes: [],
      attributions: [],
    })
    const result = await computeCrossCustomerBenchmark({ ...SEP, windowDays: 30, store })
    expect(result.activeCustomerCount).toBe(0)
    expect(result.rows).toEqual([])
  })
})

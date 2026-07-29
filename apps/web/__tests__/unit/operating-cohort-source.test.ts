import { describe, expect, it, vi } from "vitest"
import {
  OPERATING_COHORT_FIELD_NAMES,
} from "@/lib/aim/operating-cohort-field-contract"
import {
  buildOperatingCohortRecords,
  loadOperatingCohortEnrichment,
  type OperatingCohortEnrichment,
} from "@/lib/aim/operating-cohort-source"

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    fields: OPERATING_COHORT_FIELD_NAMES.map((name) => ({
      name,
      type: "text",
      writable: false,
    })),
    records: [{
      recordId: "feishu_record_1",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      fields: {
        AIM生成ID: "generation_1",
        线索记录ID: "lead_1",
        预约记录ID: "appointment_1",
        成交记录ID: "deal_1",
        回款记录ID: "payment_1",
        客户结果记录ID: "outcome_1",
        行业: "教培",
        产品类型: "咨询",
        客单价区间: "高客单",
        获客渠道: "视频号",
        客户阶段: "增长期",
        问题紧迫度: "高",
        线索发生时间: "2026-07-02T00:00:00Z",
        预约发生时间: "2026-07-03T00:00:00Z",
        成交发生时间: "2026-07-05T00:00:00Z",
        回款发生时间: "2026-07-06T00:00:00Z",
        ...overrides,
      },
    }],
  }
}

function enrichment(): OperatingCohortEnrichment {
  return {
    generationById: new Map([["generation_1", { projectId: "project_1" }]]),
    costByGenerationId: new Map([[
      "generation_1",
      { count: 2, totalCny: 12 },
    ]]),
    outcomeByExternalId: new Map([[
      "outcome_1",
      {
        approved: true,
        observedTo: new Date("2026-07-12T00:00:00Z"),
        caseApproved: true,
      },
    ]]),
  }
}

describe("operating cohort source", () => {
  it("从飞书外部记录构造六维样本，并关联成本、结果和案例证据", () => {
    const result = buildOperatingCohortRecords({
      snapshot: snapshot(),
      enrichment: enrichment(),
      start: new Date("2026-07-01T00:00:00Z"),
      end: new Date("2026-08-01T00:00:00Z"),
      projectId: "project_1",
    })
    expect(result.records).toHaveLength(6)
    expect(result.records.find((row) => row.dimension === "industry")).toMatchObject({
      externalRecordId: "feishu_record_1",
      segmentKey: "教培",
      leadCount: 1,
      appointmentCount: 1,
      dealCount: 1,
      paymentCount: 1,
      customerOutcomeSuccessCount: 1,
      dealCycleDays: 3,
      deliveryCycleDays: 7,
      successTaskCount: 2,
      successTaskTotalCostCny: 12,
      caseApproved: true,
    })
    expect(result.diagnostics.eligibleSourceRecords).toBe(1)
  })

  it("缺维度保留为 unknown，缺稳定链接或项目不匹配则跳过", () => {
    const unknown = buildOperatingCohortRecords({
      snapshot: snapshot({ 行业: "" }),
      enrichment: enrichment(),
      start: new Date("2026-07-01T00:00:00Z"),
      end: new Date("2026-08-01T00:00:00Z"),
    })
    expect(unknown.records.find((row) => row.dimension === "industry")?.segmentKey)
      .toBe("unknown")
    expect(unknown.diagnostics.unknownDimensionValues).toBe(1)

    const wrongProject = buildOperatingCohortRecords({
      snapshot: snapshot(),
      enrichment: enrichment(),
      start: new Date("2026-07-01T00:00:00Z"),
      end: new Date("2026-08-01T00:00:00Z"),
      projectId: "project_other",
    })
    expect(wrongProject.records).toEqual([])
    expect(wrongProject.diagnostics.skippedOutsideProject).toBe(1)
  })

  it("中间环节证据缺失时不推断后续转化，并记录漏斗缺口", () => {
    const result = buildOperatingCohortRecords({
      snapshot: snapshot({
        预约记录ID: "",
        预约发生时间: "",
      }),
      enrichment: enrichment(),
      start: new Date("2026-07-01T00:00:00Z"),
      end: new Date("2026-08-01T00:00:00Z"),
    })
    expect(result.records[0]).toMatchObject({
      appointmentCount: 0,
      dealCount: 0,
      paymentCount: 0,
      customerOutcomeSuccessCount: 0,
    })
    expect(result.diagnostics.incompleteFunnelRecords).toBe(1)
  })

  it("读取前核对飞书字段，且所有 Prisma 查询有界", async () => {
    const db = {
      aimGeneration: { findMany: vi.fn(async () => []) },
      aimExecutionTrace: { findMany: vi.fn(async () => []) },
      customerOutcomeProjection: { findMany: vi.fn(async () => []) },
    }
    await loadOperatingCohortEnrichment({ snapshot: snapshot(), db: db as never })
    expect(db.aimGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    )
    expect(db.aimExecutionTrace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10_001 }),
    )
    expect(db.customerOutcomeProjection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    )

    await expect(loadOperatingCohortEnrichment({
      snapshot: {
        ...snapshot(),
        fields: snapshot().fields.filter((field) => field.name !== "行业"),
      },
      db: db as never,
    })).rejects.toThrow(/字段漂移/)
  })
})

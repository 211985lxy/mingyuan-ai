import { describe, expect, it } from "vitest"
import {
  aggregateCohortStats,
  assertTrendAllowed,
  MIN_TREND_SAMPLE,
  resolveTrendVerdict,
  type CohortRecord,
} from "@/lib/aim/operating-cohort"

function row(overrides: Partial<CohortRecord> & Pick<CohortRecord, "externalRecordId" | "segmentKey">): CohortRecord {
  return {
    dimension: "industry",
    leadCount: 1,
    appointmentCount: 1,
    dealCount: 0,
    paymentCount: 0,
    customerOutcomeSuccessCount: 0,
    windowStart: "2026-07-01T00:00:00.000Z",
    windowEnd: "2026-07-28T00:00:00.000Z",
    ...overrides,
  }
}

describe("operating-cohort", () => {
  it("样本 < 10 只展示数据，趋势为 insufficient_sample", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      row({ externalRecordId: `ext_${i}`, segmentKey: "教培", appointmentCount: i % 2 }),
    )
    const stats = aggregateCohortStats(records)
    expect(stats).toHaveLength(1)
    expect(stats[0].sampleSize).toBe(5)
    expect(stats[0].sampleSize).toBeLessThan(MIN_TREND_SAMPLE)
    expect(stats[0].trendVerdict).toBe("insufficient_sample")
    expect(stats[0].externalRecordIds).toContain("ext_0")
    expect(() => assertTrendAllowed(stats[0])).toThrow(/禁止输出趋势/)
  })

  it("样本 ≥ 10 才允许趋势；无对照期则为 flat", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      row({
        externalRecordId: `ext_${i}`,
        segmentKey: "美业",
        leadCount: 2,
        appointmentCount: 1,
      }),
    )
    const stats = aggregateCohortStats(records)
    expect(stats[0].trendVerdict).toBe("flat")
    expect(stats[0].leadToAppointmentRate).toBeCloseTo(0.5)
    expect(() => assertTrendAllowed(stats[0])).not.toThrow()
  })

  it("有对照期时可给 up/down；resolveTrendVerdict 门闩", () => {
    expect(
      resolveTrendVerdict({ sampleSize: 3, currentRate: 0.5, previousRate: 0.2 }).verdict,
    ).toBe("insufficient_sample")

    expect(
      resolveTrendVerdict({
        sampleSize: 12,
        currentRate: 0.6,
        previousRate: 0.4,
        previousSampleSize: 12,
      }).verdict,
    ).toBe("up")

    expect(
      resolveTrendVerdict({
        sampleSize: 12,
        currentRate: 0.3,
        previousRate: 0.5,
        previousSampleSize: 12,
      }).verdict,
    ).toBe("down")

    const records = Array.from({ length: 12 }, (_, i) =>
      row({
        externalRecordId: `ext_${i}`,
        segmentKey: "高客单",
        dimension: "deal_size_band",
        leadCount: 10,
        appointmentCount: 8,
      }),
    )
    const stats = aggregateCohortStats(records, {
      previousLeadToAppointmentByGroup: {
        "deal_size_band::高客单": {
          leadToAppointmentRate: 0.5,
          sampleSize: 12,
        },
      },
    })
    expect(stats[0].trendVerdict).toBe("up")
  })

  it("转化率分母为 0 时返回 null，不当 0", () => {
    const records = [
      row({
        externalRecordId: "ext_x",
        segmentKey: "空漏斗",
        leadCount: 0,
        appointmentCount: 0,
        dealCount: 0,
      }),
    ]
    // 凑满 10 条同群，测比率 null 而非趋势
    for (let i = 0; i < 9; i += 1) {
      records.push(
        row({
          externalRecordId: `ext_pad_${i}`,
          segmentKey: "空漏斗",
          leadCount: 0,
          appointmentCount: 0,
        }),
      )
    }
    const stats = aggregateCohortStats(records)
    expect(stats[0].leadToAppointmentRate).toBeNull()
    expect(stats[0].appointmentToDealRate).toBeNull()
  })

  it("对照期样本不足时同样禁止趋势判断", () => {
    expect(resolveTrendVerdict({
      sampleSize: 12,
      currentRate: 0.6,
      previousRate: 0.4,
      previousSampleSize: 3,
    }).verdict).toBe("insufficient_sample")
  })

  it("成功任务成本按任务数加权，不平均各线索均值", () => {
    const records = [
      row({
        externalRecordId: "ext_cost_1",
        segmentKey: "咨询",
        successTaskCount: 1,
        successTaskTotalCostCny: 10,
      }),
      row({
        externalRecordId: "ext_cost_2",
        segmentKey: "咨询",
        successTaskCount: 3,
        successTaskTotalCostCny: 30,
      }),
    ]
    expect(aggregateCohortStats(records)[0].avgSuccessTaskCostCny).toBe(10)
  })
})

import { describe, expect, it } from "vitest"
import {
  CustomerOutcomeProjectionError,
  upsertCustomerOutcomeProjection,
  type CustomerOutcomeProjectionRecord,
  type CustomerOutcomeProjectionStorePort,
} from "@/lib/aim/customer-outcome-projection"

function store(): CustomerOutcomeProjectionStorePort & {
  rows: CustomerOutcomeProjectionRecord[]
} {
  const rows: CustomerOutcomeProjectionRecord[] = []
  return {
    rows,
    findByExternalOutcomeId: async (id) =>
      rows.find((row) => row.externalOutcomeId === id) ?? null,
    findByExternalRecordId: async (id) =>
      rows.find((row) => row.externalRecordId === id) ?? null,
    create: async (data) => {
      const row = { ...data, id: data.id ?? `outcome_${rows.length + 1}` }
      rows.push(row)
      return row
    },
    update: async (id, data) => {
      const index = rows.findIndex((row) => row.id === id)
      if (index < 0) throw new Error("missing")
      rows[index] = { ...rows[index], ...data }
      return rows[index]
    },
  }
}

function approved(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project_1",
    externalOutcomeId: "outcome_1",
    externalDealId: "deal_1",
    externalRecordId: "rec_1",
    externalTableId: "table_1",
    metricCode: "lead_to_deal_rate",
    baseline: "0.10",
    target: "0.20",
    actual: "0.28",
    unit: "%",
    observedFrom: new Date("2026-07-01T00:00:00Z"),
    observedTo: new Date("2026-07-28T00:00:00Z"),
    evidenceRef: "feishu:doc/evidence",
    reviewStatus: "approved",
    reviewerRef: "ou_reviewer",
    reviewedAt: new Date("2026-07-29T00:00:00Z"),
    ...overrides,
  }
}

describe("customer outcome projection", () => {
  it("approved 必须有完整证据和审核时间", async () => {
    for (const overrides of [
      { baseline: null },
      { actual: null },
      { evidenceRef: "" },
      { reviewerRef: null },
      { reviewedAt: null },
    ]) {
      await expect(upsertCustomerOutcomeProjection(
        approved(overrides),
        store(),
      )).rejects.toMatchObject({
        code: "approved_without_evidence",
      } satisfies Partial<CustomerOutcomeProjectionError>)
    }
  })

  it("同一外部结果幂等更新数值，不重复创建", async () => {
    const target = store()
    const first = await upsertCustomerOutcomeProjection(approved(), target)
    const second = await upsertCustomerOutcomeProjection(
      approved({ actual: "0.31" }),
      target,
    )
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(target.rows).toHaveLength(1)
    expect(target.rows[0]?.actual).toBe("0.31")
  })

  it("禁止把同一飞书记录改绑到其它项目或结果", async () => {
    const target = store()
    await upsertCustomerOutcomeProjection(approved(), target)
    await expect(upsertCustomerOutcomeProjection(
      approved({ projectId: "project_2" }),
      target,
    )).rejects.toMatchObject({ code: "projection_conflict" })
  })

  it("观察开始晚于结束时拒绝", async () => {
    await expect(upsertCustomerOutcomeProjection(approved({
      observedFrom: new Date("2026-07-30T00:00:00Z"),
      observedTo: new Date("2026-07-29T00:00:00Z"),
    }), store())).rejects.toMatchObject({ code: "invalid_period" })
  })
})

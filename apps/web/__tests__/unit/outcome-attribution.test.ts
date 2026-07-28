import { describe, expect, it } from "vitest"
import {
  normalizeAttributionMethod,
  resolveAttributionMethod,
  upsertOutcomeAttribution,
  type OutcomeAttributionRecord,
  type OutcomeAttributionStorePort,
} from "@/lib/aim/outcome-attribution"

function makeStore(seed: OutcomeAttributionRecord[] = []): OutcomeAttributionStorePort & {
  rows: OutcomeAttributionRecord[]
} {
  const rows = [...seed]
  return {
    rows,
    findByExternalLeadId: async (externalLeadId) =>
      rows.find((row) => row.externalLeadId === externalLeadId) ?? null,
    findByExternalDealId: async (externalDealId) =>
      rows.find((row) => row.externalDealId === externalDealId) ?? null,
    findByExternalPaymentId: async (externalPaymentId) =>
      rows.find((row) => row.externalPaymentId === externalPaymentId) ?? null,
    create: async (data) => {
      const record: OutcomeAttributionRecord = {
        id: data.id ?? `attr_${rows.length + 1}`,
        userId: data.userId,
        generationId: data.generationId,
        externalLeadId: data.externalLeadId,
        externalAppointmentId: data.externalAppointmentId,
        externalDealId: data.externalDealId,
        externalPaymentId: data.externalPaymentId,
        attributionMethod: data.attributionMethod,
        attributionConfidence: data.attributionConfidence,
        occurredAt: data.occurredAt,
      }
      rows.push(record)
      return record
    },
  }
}

describe("resolveAttributionMethod", () => {
  it("无线索 ID → unknown", () => {
    expect(
      resolveAttributionMethod({
        candidateGenerationId: "g1",
        externalLeadId: null,
        explicitLink: true,
      }),
    ).toEqual({ method: "unknown", confidence: "low" })
  })

  it("明确绑定 → explicit / high", () => {
    expect(
      resolveAttributionMethod({
        candidateGenerationId: "g1",
        externalLeadId: "lead_1",
        explicitLink: true,
      }),
    ).toEqual({ method: "explicit", confidence: "high" })
  })

  it("首触一致 → first_touch / medium", () => {
    expect(
      resolveAttributionMethod({
        candidateGenerationId: "g1",
        externalLeadId: "lead_1",
        firstTouchGenerationId: "g1",
      }),
    ).toEqual({ method: "first_touch", confidence: "medium" })
  })

  it("证据不足（非首触且未明确）→ unknown", () => {
    expect(
      resolveAttributionMethod({
        candidateGenerationId: "g2",
        externalLeadId: "lead_1",
        firstTouchGenerationId: "g1",
      }),
    ).toEqual({ method: "unknown", confidence: "low" })
  })

  it("非法 method 字符串降为 unknown", () => {
    expect(normalizeAttributionMethod("multi_touch")).toBe("unknown")
    expect(normalizeAttributionMethod("explicit")).toBe("explicit")
  })
})

describe("upsertOutcomeAttribution 幂等", () => {
  const base = {
    userId: "u1",
    generationId: "g1",
    externalLeadId: "lead_1",
    occurredAt: new Date("2026-07-10T00:00:00.000Z"),
    explicitLink: true,
  }

  it("同一线索 ID 二次写入返回原记录且不新建", async () => {
    const store = makeStore()
    const first = await upsertOutcomeAttribution(base, store)
    const second = await upsertOutcomeAttribution(
      { ...base, generationId: "g_other", explicitLink: false },
      store,
    )
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.record.id).toBe(first.record.id)
    expect(store.rows).toHaveLength(1)
    expect(first.record.attributionMethod).toBe("explicit")
  })

  it("同一成交 ID 幂等，即使线索不同", async () => {
    const store = makeStore()
    const first = await upsertOutcomeAttribution(
      { ...base, externalDealId: "deal_1" },
      store,
    )
    const second = await upsertOutcomeAttribution(
      {
        ...base,
        externalLeadId: "lead_2",
        externalDealId: "deal_1",
        generationId: "g9",
      },
      store,
    )
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.record.id).toBe(first.record.id)
    expect(store.rows).toHaveLength(1)
  })

  it("同一回款 ID 幂等", async () => {
    const store = makeStore()
    const first = await upsertOutcomeAttribution(
      { ...base, externalPaymentId: "pay_1" },
      store,
    )
    const second = await upsertOutcomeAttribution(
      {
        ...base,
        externalLeadId: "lead_9",
        externalPaymentId: "pay_1",
      },
      store,
    )
    expect(second.created).toBe(false)
    expect(second.record.id).toBe(first.record.id)
  })
})

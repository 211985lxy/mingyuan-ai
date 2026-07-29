import { describe, expect, it } from "vitest"
import {
  generateCustomerOutcomeCaseCandidate,
} from "@/lib/aim/customer-outcome-case-store"

function makeStore(overrides: {
  reviewStatus?: string
  evidenceRef?: string
  externalDealId?: string | null
  attribution?: { generationId: string; userId: string } | null
} = {}) {
  const candidates: Array<Record<string, unknown>> = []
  const outcome = {
    id: "projection_1",
    projectId: "project_1",
    externalOutcomeId: "outcome_1",
    externalDealId:
      overrides.externalDealId === undefined ? "deal_1" : overrides.externalDealId,
    externalRecordId: "rec_1",
    metricCode: "revenue_30d",
    baseline: "10",
    target: "20",
    actual: "28",
    unit: "万",
    observedFrom: new Date("2026-07-01T00:00:00Z"),
    observedTo: new Date("2026-07-28T00:00:00Z"),
    evidenceRef: overrides.evidenceRef ?? "feishu:doc/evidence",
    reviewStatus: overrides.reviewStatus ?? "approved",
    reviewerRef: "ou_reviewer",
    reviewedAt: new Date("2026-07-29T00:00:00Z"),
    project: { userId: "user_1", name: "客户A" },
  }
  return {
    candidates,
    store: {
      customerOutcomeProjection: {
        findUnique: async () => outcome,
      },
      outcomeAttribution: {
        findUnique: async () =>
          overrides.attribution === undefined
            ? { generationId: "generation_1", userId: "user_1" }
            : overrides.attribution,
      },
      aimGeneration: {
        findFirst: async () => ({ id: "generation_1" }),
      },
      assetCandidate: {
        findUnique: async () =>
          candidates.find((row) =>
            row.customerOutcomeProjectionId === "projection_1") ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "candidate_1", ...data }
          candidates.push(row)
          return row
        },
      },
    },
  }
}

describe("customer outcome success-case candidate", () => {
  it("已审核结果 + 成交归因 → 项目级成功案例候选，并且幂等", async () => {
    const context = makeStore()
    const first = await generateCustomerOutcomeCaseCandidate({
      customerOutcomeProjectionId: "projection_1",
      store: context.store,
    })
    const second = await generateCustomerOutcomeCaseCandidate({
      customerOutcomeProjectionId: "projection_1",
      store: context.store,
    })
    expect(first).toMatchObject({ ok: true, created: true })
    expect(second).toMatchObject({ ok: true, created: false })
    expect(context.candidates).toHaveLength(1)
    expect(context.candidates[0]).toEqual(expect.objectContaining({
      generationId: "generation_1",
      projectId: "project_1",
      customerOutcomeProjectionId: "projection_1",
      reviewStatus: "pending",
      crossProjectAllowed: false,
    }))
  })

  it("无证据、无成交或无可信归因时 fail closed", async () => {
    for (const context of [
      makeStore({ evidenceRef: "" }),
      makeStore({ externalDealId: null }),
      makeStore({ attribution: null }),
    ]) {
      const result = await generateCustomerOutcomeCaseCandidate({
        customerOutcomeProjectionId: "projection_1",
        store: context.store,
      })
      expect(result.ok).toBe(false)
      expect(context.candidates).toHaveLength(0)
    }
  })
})

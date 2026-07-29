import { describe, expect, it, vi } from "vitest"
import {
  hasNonEmptyAnnotation,
  isApprovedCustomerOutcomeEvidence,
  loadAnnotatedLearningSamples,
  loadReusedCustomerOutcomeCases,
  type AnnotatedSampleStorePort,
  type ReusedCaseStorePort,
} from "@/lib/aim/operating-qualification-reuse"

const PROMOTED_AT = new Date("2026-06-01T00:00:00.000Z")
const AFTER = new Date("2026-06-02T00:00:00.000Z")

function approvedOutcome(overrides: Partial<{
  reviewStatus: string
  baseline: unknown
  actual: unknown
  reviewerRef: string | null
  reviewedAt: Date | null
  evidenceRef: string
}> = {}) {
  return {
    reviewStatus: "approved",
    baseline: { leads: 10 },
    actual: { leads: 12 },
    reviewerRef: "reviewer_1",
    reviewedAt: PROMOTED_AT,
    evidenceRef: "evidence://1",
    ...overrides,
  }
}

function makeReuseStore(input: {
  candidates?: ReusedCaseStorePort["assetCandidate"]["findMany"] extends (
    ...args: infer _
  ) => Promise<infer R> ? R : never
  entries?: Array<{ id: string }>
  generations?: Array<{ id: string; createdAt: Date; knowledgeUsed: unknown }>
}): ReusedCaseStorePort {
  return {
    assetCandidate: {
      findMany: vi.fn(async () => input.candidates ?? []),
    },
    knowledgeEntry: {
      findMany: vi.fn(async () => input.entries ?? []),
    },
    aimGeneration: {
      findMany: vi.fn(async () => input.generations ?? []),
    },
  }
}

describe("operating qualification reuse evidence", () => {
  it("空 annotation={} 不计人工标注", () => {
    expect(hasNonEmptyAnnotation({ annotation: {} })).toBe(false)
    expect(hasNonEmptyAnnotation({ annotation: { note: "ok" } })).toBe(true)
    expect(hasNonEmptyAnnotation({})).toBe(false)
  })

  it("outcome 必须 approved 且字段齐全", () => {
    expect(isApprovedCustomerOutcomeEvidence(approvedOutcome())).toBe(true)
    expect(isApprovedCustomerOutcomeEvidence(approvedOutcome({
      reviewStatus: "rejected",
    }))).toBe(false)
    expect(isApprovedCustomerOutcomeEvidence(approvedOutcome({
      reviewerRef: "  ",
    }))).toBe(false)
    expect(isApprovedCustomerOutcomeEvidence(approvedOutcome({
      reviewedAt: null,
    }))).toBe(false)
  })

  it("rejected outcome 不计案例复用", async () => {
    const store = makeReuseStore({
      candidates: [{
        id: "cand_1",
        promotedEntryId: "entry_1",
        promotedAt: PROMOTED_AT,
        customerOutcomeProjectionId: "outcome_1",
        customerOutcomeProjection: approvedOutcome({ reviewStatus: "rejected" }),
      }],
      entries: [{ id: "entry_1" }],
      generations: [{
        id: "gen_1",
        createdAt: AFTER,
        knowledgeUsed: [{ id: "entry_1" }],
      }],
    })
    const result = await loadReusedCustomerOutcomeCases(store)
    expect(result).toEqual({ count: 0, refs: [] })
    expect(store.aimGeneration.findMany).not.toHaveBeenCalled()
  })

  it("AimGeneration.createdAt 必须严格晚于 promotedAt（同时间不计）", async () => {
    const store = makeReuseStore({
      candidates: [{
        id: "cand_1",
        promotedEntryId: "entry_1",
        promotedAt: PROMOTED_AT,
        customerOutcomeProjectionId: "outcome_1",
        customerOutcomeProjection: approvedOutcome(),
      }],
      entries: [{ id: "entry_1" }],
      generations: [{
        id: "gen_same",
        createdAt: PROMOTED_AT,
        knowledgeUsed: [{ id: "entry_1" }],
      }],
    })
    const sameTime = await loadReusedCustomerOutcomeCases(store)
    expect(sameTime).toEqual({ count: 0, refs: [] })

    const laterStore = makeReuseStore({
      candidates: [{
        id: "cand_1",
        promotedEntryId: "entry_1",
        promotedAt: PROMOTED_AT,
        customerOutcomeProjectionId: "outcome_1",
        customerOutcomeProjection: approvedOutcome(),
      }],
      entries: [{ id: "entry_1" }],
      generations: [{
        id: "gen_later",
        createdAt: AFTER,
        knowledgeUsed: [{ id: "entry_1" }],
      }],
    })
    const later = await loadReusedCustomerOutcomeCases(laterStore)
    expect(later).toEqual({
      count: 1,
      refs: ["asset_candidate:cand_1"],
    })
  })

  it("loadAnnotatedLearningSamples 过滤空 annotation", async () => {
    const store: AnnotatedSampleStorePort = {
      learningCandidate: {
        findMany: vi.fn(async () => [
          { id: "lc_empty", reviewerId: "r1", payload: { annotation: {} } },
          { id: "lc_ok", reviewerId: "r1", payload: { annotation: { label: "good" } } },
          { id: "lc_no_reviewer", reviewerId: "  ", payload: { annotation: { label: "x" } } },
        ]),
      },
    }
    const result = await loadAnnotatedLearningSamples(store)
    expect(result).toEqual({
      count: 1,
      refs: ["learning_candidate:lc_ok"],
    })
  })
})

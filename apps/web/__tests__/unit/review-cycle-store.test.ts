import { describe, expect, it } from "vitest"
import {
  createReviewCycle,
  signReviewCycle,
  updateReviewActionStatus,
  type ReviewActionRecord,
  type ReviewCycleRecord,
  type ReviewCycleStorePort,
} from "@/lib/aim/review-cycle-store"

const START = new Date("2026-07-06T00:00:00Z")
const END = new Date("2026-07-13T00:00:00Z")
const SNAPSHOT = {
  publishedCount: 3,
  qualifiedLeadCount: 2,
  appointmentCount: 1,
  dealCount: 1,
  revenue: 10000,
  paymentCount: 1,
  paymentAmountCny: null,
  customerOutcomeCount: 1,
  timeSavedMinutes: 40,
  firstPassAcceptanceRate: 0.5,
  rewriteRate: 0.2,
  rejectionRate: 0.1,
  directCostPerSuccess: 2,
  fullyLoadedCost: 120,
  p0FailureCount: 0,
  p1FailureCount: 1,
  humanTakeoverCount: 1,
  highCostAnomalyCount: 0,
  pendingKnowledgeCandidates: 2,
  pendingCaseCandidates: 1,
  pendingMemoryCandidates: 0,
  pendingEvalCandidates: 1,
  pendingMethodologyCandidates: 1,
  previousActionCloseRate: 0.75,
  day7BackfillRate: 0.8,
}

function makeStore() {
  const cycles: ReviewCycleRecord[] = []
  const actions: ReviewActionRecord[] = []
  const store: ReviewCycleStorePort = {
    reviewCycle: {
      findUnique: async (args) => {
        const where = args.where as { id?: string; requestId?: string }
        const cycle = cycles.find((row) =>
          where.id ? row.id === where.id : row.requestId === where.requestId)
        return cycle ? { ...cycle, actions: actions.filter((a) => a.reviewCycleId === cycle.id) } : null
      },
      create: async (args) => {
        const data = args.data as Record<string, unknown> & {
          actions: { create: Array<Record<string, unknown>> }
        }
        const cycle: ReviewCycleRecord = {
          id: `cycle_${cycles.length + 1}`,
          requestId: data.requestId as string,
          periodStart: data.periodStart as Date,
          periodEnd: data.periodEnd as Date,
          status: data.status as string,
          metricsSnapshot: data.metricsSnapshot,
          systemOwnerId: data.systemOwnerId as string,
          filterSnapshot: data.filterSnapshot,
          signedAt: null,
          signedApprovalId: null,
          actions: [],
        }
        cycles.push(cycle)
        for (const item of data.actions.create) {
          actions.push({
            id: `action_${actions.length + 1}`,
            reviewCycleId: cycle.id,
            title: item.title as string,
            ownerId: item.ownerId as string,
            dueAt: item.dueAt as Date,
            status: item.status as string,
            evidenceRef: item.evidenceRef as string | null,
          })
        }
        return { ...cycle, actions: [...actions] }
      },
      updateMany: async (args) => {
        const where = args.where as { id: string; status: string }
        const cycle = cycles.find((row) => row.id === where.id && row.status === where.status)
        if (!cycle) return { count: 0 }
        Object.assign(cycle, args.data)
        return { count: 1 }
      },
    },
    reviewAction: {
      findUnique: async (args) => {
        const where = args.where as { id: string }
        const action = actions.find((row) => row.id === where.id)
        if (!action) return null
        const cycle = cycles.find((row) => row.id === action.reviewCycleId)!
        return { ...action, reviewCycle: { status: cycle.status } }
      },
      create: async () => {
        throw new Error("not used")
      },
      update: async (args) => {
        const where = args.where as { id: string }
        const action = actions.find((row) => row.id === where.id)!
        Object.assign(action, args.data)
        return action
      },
    },
  }
  return { store, cycles, actions }
}

describe("review cycle persistence", () => {
  it("requestId 幂等创建周期和行动项", async () => {
    const context = makeStore()
    const input = {
      draft: {
        requestId: "review_request_1",
        periodStart: START,
        periodEnd: END,
        systemOwnerId: "system_owner_1",
        metricsSnapshot: SNAPSHOT,
      },
      actions: [{ title: "修复高成本任务", ownerId: "owner_1", dueAt: END }],
      store: context.store,
    }
    const first = await createReviewCycle(input)
    const second = await createReviewCycle(input)
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(context.cycles).toHaveLength(1)
    expect(context.actions).toHaveLength(1)
  })

  it("有行动项后可签字，同 approvalId 重放幂等", async () => {
    const context = makeStore()
    const created = await createReviewCycle({
      draft: {
        requestId: "review_request_1",
        periodStart: START,
        periodEnd: END,
        systemOwnerId: "system_owner_1",
        metricsSnapshot: SNAPSHOT,
      },
      actions: [{ title: "行动", ownerId: "owner_1", dueAt: END }],
      store: context.store,
    })
    const first = await signReviewCycle({
      reviewCycleId: created.record.id,
      approvalId: "approval_1",
      store: context.store,
      now: END,
    })
    const second = await signReviewCycle({
      reviewCycleId: created.record.id,
      approvalId: "approval_1",
      store: context.store,
    })
    expect(first.idempotent).toBe(false)
    expect(second.idempotent).toBe(true)
    expect(context.cycles[0]?.status).toBe("signed")
  })

  it("行动项只允许 open → done/cancelled，不可回退", async () => {
    const context = makeStore()
    const created = await createReviewCycle({
      draft: {
        requestId: "review_request_1",
        periodStart: START,
        periodEnd: END,
        systemOwnerId: "system_owner_1",
        metricsSnapshot: SNAPSHOT,
      },
      actions: [{ title: "行动", ownerId: "owner_1", dueAt: END }],
      store: context.store,
    })
    const action = created.record.actions[0]!
    await updateReviewActionStatus({
      actionId: action.id,
      reviewCycleId: created.record.id,
      status: "done",
      evidenceRef: "feishu:doc/action",
      store: context.store,
    })
    await expect(updateReviewActionStatus({
      actionId: action.id,
      reviewCycleId: created.record.id,
      status: "open",
      store: context.store,
    })).rejects.toThrow(/不得再次变更|不能回退/)
    await expect(updateReviewActionStatus({
      actionId: action.id,
      reviewCycleId: "other_cycle",
      status: "cancelled",
      store: context.store,
    })).rejects.toThrow(/不属于该周复盘/)
  })
})

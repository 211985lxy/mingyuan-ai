import {
  canSignReviewCycle,
  isReviewActionStatus,
  validateReviewActionDraft,
  validateReviewCycleDraft,
  type ReviewActionDraft,
  type ReviewCycleDraft,
} from "@/lib/aim/review-cycle"
import { prisma } from "@/lib/prisma"

export interface ReviewCycleRecord {
  id: string
  requestId: string | null
  periodStart: Date
  periodEnd: Date
  status: string
  metricsSnapshot: unknown
  systemOwnerId: string
  filterSnapshot: unknown
  signedAt: Date | null
  signedApprovalId: string | null
  actions: ReviewActionRecord[]
}

export interface ReviewActionRecord {
  id: string
  reviewCycleId: string
  title: string
  ownerId: string
  dueAt: Date
  status: string
  evidenceRef: string | null
}

export interface ReviewCycleStorePort {
  reviewCycle: {
    findUnique(args: Record<string, unknown>): Promise<ReviewCycleRecord | null>
    create(args: Record<string, unknown>): Promise<ReviewCycleRecord>
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>
  }
  reviewAction: {
    findUnique(args: Record<string, unknown>): Promise<
      (ReviewActionRecord & { reviewCycle: { status: string } }) | null
    >
    create(args: Record<string, unknown>): Promise<ReviewActionRecord>
    update(args: Record<string, unknown>): Promise<ReviewActionRecord>
  }
}

function defaultStore(): ReviewCycleStorePort {
  return prisma as unknown as ReviewCycleStorePort
}

export async function createReviewCycle(input: {
  draft: ReviewCycleDraft
  actions: ReviewActionDraft[]
  store?: ReviewCycleStorePort
}): Promise<{ record: ReviewCycleRecord; created: boolean }> {
  const store = input.store ?? defaultStore()
  const draft = validateReviewCycleDraft(input.draft)
  if (input.actions.length < 1) throw new Error("周复盘必须形成至少一条行动项")
  const actions = input.actions.map(validateReviewActionDraft)
  const existing = await store.reviewCycle.findUnique({
    where: { requestId: draft.requestId },
    include: { actions: true },
  })
  if (existing) return { record: existing, created: false }
  const record = await store.reviewCycle.create({
    data: {
      requestId: draft.requestId,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      status: "draft",
      metricsSnapshot: draft.metricsSnapshot,
      systemOwnerId: draft.systemOwnerId,
      filterSnapshot: draft.filterSnapshot ?? {},
      actions: {
        create: actions.map((action) => ({
          ...action,
          status: "open",
          evidenceRef: action.evidenceRef ?? null,
        })),
      },
    },
    include: { actions: true },
  })
  return { record, created: true }
}

export async function addReviewAction(input: {
  reviewCycleId: string
  draft: ReviewActionDraft
  store?: ReviewCycleStorePort
}): Promise<ReviewActionRecord> {
  const store = input.store ?? defaultStore()
  const cycle = await store.reviewCycle.findUnique({
    where: { id: input.reviewCycleId },
    include: { actions: true },
  })
  if (!cycle) throw new Error("周复盘不存在")
  if (cycle.status !== "draft") throw new Error("已签字周复盘不得新增行动项")
  const draft = validateReviewActionDraft(input.draft)
  return store.reviewAction.create({
    data: {
      reviewCycleId: cycle.id,
      ...draft,
      evidenceRef: draft.evidenceRef ?? null,
      status: "open",
    },
  })
}

export async function updateReviewActionStatus(input: {
  actionId: string
  status: string
  evidenceRef?: string | null
  store?: ReviewCycleStorePort
}): Promise<ReviewActionRecord> {
  if (!isReviewActionStatus(input.status)) throw new Error("行动项 status 不合法")
  const store = input.store ?? defaultStore()
  const action = await store.reviewAction.findUnique({
    where: { id: input.actionId },
    include: { reviewCycle: { select: { status: true } } },
  })
  if (!action) throw new Error("行动项不存在")
  if (action.status === input.status) return action
  if (action.status !== "open") throw new Error("已关闭行动项不得再次变更状态")
  if (input.status === "open") throw new Error("行动项不能回退为 open")
  return store.reviewAction.update({
    where: { id: action.id },
    data: {
      status: input.status,
      evidenceRef: input.evidenceRef?.trim() || action.evidenceRef,
    },
  })
}

export async function signReviewCycle(input: {
  reviewCycleId: string
  approvalId: string
  store?: ReviewCycleStorePort
  now?: Date
}): Promise<{ record: ReviewCycleRecord; idempotent: boolean }> {
  const store = input.store ?? defaultStore()
  const cycle = await store.reviewCycle.findUnique({
    where: { id: input.reviewCycleId },
    include: { actions: true },
  })
  if (!cycle) throw new Error("周复盘不存在")
  if (
    cycle.status === "signed"
    && cycle.signedApprovalId === input.approvalId
  ) return { record: cycle, idempotent: true }
  const gate = canSignReviewCycle({
    status: cycle.status,
    systemOwnerId: cycle.systemOwnerId,
    actionCount: cycle.actions.length,
  })
  if (!gate.ok) throw new Error(gate.reason)
  const updated = await store.reviewCycle.updateMany({
    where: { id: cycle.id, status: "draft", signedApprovalId: null },
    data: {
      status: "signed",
      signedAt: input.now ?? new Date(),
      signedApprovalId: input.approvalId,
    },
  })
  if (updated.count !== 1) throw new Error("周复盘签字发生并发冲突")
  const record = await store.reviewCycle.findUnique({
    where: { id: cycle.id },
    include: { actions: true },
  })
  if (!record) throw new Error("周复盘签字后回读失败")
  return { record, idempotent: false }
}

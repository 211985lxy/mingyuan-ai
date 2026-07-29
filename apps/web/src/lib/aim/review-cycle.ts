/**
 * 周度经营复盘与行动台账（WP-5）纯域层。
 *
 * - ReviewCycle 必须有 metricsSnapshot + systemOwner；签字后不可改指标。
 * - ReviewAction 必须有 title / owner / dueAt；周复盘签字前至少一条行动项。
 * - 岗位评价接入需连续 ≥4 周已签字周期；本模块只提供门闩，不写评价逻辑。
 */

export const REVIEW_CYCLE_STATUSES = ["draft", "signed"] as const
export type ReviewCycleStatus = (typeof REVIEW_CYCLE_STATUSES)[number]

export const REVIEW_ACTION_STATUSES = ["open", "done", "cancelled"] as const
export type ReviewActionStatus = (typeof REVIEW_ACTION_STATUSES)[number]

export interface ReviewCycleFilters {
  projectId?: string
  workflowId?: string
  ownerId?: string
  channel?: "web" | "feishu" | "api"
}

/** 周报固定展示指标快照（可扩展字段，序列化进 metricsSnapshot） */
export interface ReviewMetricsSnapshot {
  publishedCount: number
  qualifiedLeadCount: number
  appointmentCount: number
  dealCount: number
  revenue: number
  paymentCount: number
  /** 无真实回款金额来源时保持 null，禁止用成交额冒充 */
  paymentAmountCny: number | null
  customerOutcomeCount: number
  timeSavedMinutes: number | null
  firstPassAcceptanceRate: number | null
  rewriteRate: number | null
  rejectionRate: number | null
  directCostPerSuccess: number | null
  fullyLoadedCost: number | null
  p0FailureCount: number
  p1FailureCount: number
  humanTakeoverCount: number
  highCostAnomalyCount: number
  pendingKnowledgeCandidates: number
  pendingCaseCandidates: number
  pendingMemoryCandidates: number
  pendingEvalCandidates: number
  pendingMethodologyCandidates: number
  previousActionCloseRate: number | null
  day7BackfillRate: number | null
  /** 资格闸门证据；旧快照缺失时保持 unknown，不推测回填。 */
  runIdCoverage?: number | null
  costCoverage?: number | null
  finalDispositionCoverage?: number | null
  generationLinkCoverage?: number | null
}

export interface ReviewCycleDraft {
  requestId: string
  periodStart: Date
  periodEnd: Date
  systemOwnerId: string
  metricsSnapshot: ReviewMetricsSnapshot
  filterSnapshot?: ReviewCycleFilters
}

export interface ReviewActionDraft {
  title: string
  ownerId: string
  dueAt: Date
  evidenceRef?: string
}

export interface ReviewActionLike {
  status: string
}

export interface ReviewCycleLike {
  status: string
  signedAt?: Date | string | null
  periodStart: Date | string
  periodEnd: Date | string
  actions?: ReviewActionLike[]
}

const STATUS_SET = new Set<string>(REVIEW_CYCLE_STATUSES)
const ACTION_STATUS_SET = new Set<string>(REVIEW_ACTION_STATUSES)
const RATE_KEYS = [
  "firstPassAcceptanceRate",
  "rewriteRate",
  "rejectionRate",
  "previousActionCloseRate",
  "day7BackfillRate",
  "runIdCoverage",
  "costCoverage",
  "finalDispositionCoverage",
  "generationLinkCoverage",
] as const
const NULLABLE_NUMBER_KEYS = [
  "timeSavedMinutes",
  "directCostPerSuccess",
  "fullyLoadedCost",
  "paymentAmountCny",
  ...RATE_KEYS,
] as const
const REQUIRED_NUMBER_KEYS = [
  "publishedCount",
  "qualifiedLeadCount",
  "appointmentCount",
  "dealCount",
  "revenue",
  "paymentCount",
  "customerOutcomeCount",
  "p0FailureCount",
  "p1FailureCount",
  "humanTakeoverCount",
  "highCostAnomalyCount",
  "pendingKnowledgeCandidates",
  "pendingCaseCandidates",
  "pendingMemoryCandidates",
  "pendingEvalCandidates",
  "pendingMethodologyCandidates",
] as const
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const FILTER_KEYS = ["projectId", "workflowId", "ownerId", "channel"] as const

/** 移除 undefined / 空字符串字段，得到规范化筛选快照。 */
export function normalizeReviewCycleFilters(
  filters: ReviewCycleFilters | undefined | null,
): ReviewCycleFilters {
  if (!filters || typeof filters !== "object") return {}
  const normalized: ReviewCycleFilters = {}
  for (const key of FILTER_KEYS) {
    const value = filters[key]
    if (typeof value === "string" && value.trim()) {
      normalized[key] = value.trim() as never
    }
  }
  return normalized
}

export function isReviewCycleStatus(value: unknown): value is ReviewCycleStatus {
  return typeof value === "string" && STATUS_SET.has(value)
}

export function isReviewActionStatus(value: unknown): value is ReviewActionStatus {
  return typeof value === "string" && ACTION_STATUS_SET.has(value)
}

export function assertValidReviewPeriod(periodStart: Date, periodEnd: Date): void {
  if (!(periodStart instanceof Date) || Number.isNaN(periodStart.getTime())) {
    throw new Error("periodStart 无效")
  }
  if (!(periodEnd instanceof Date) || Number.isNaN(periodEnd.getTime())) {
    throw new Error("periodEnd 无效")
  }
  if (periodEnd.getTime() <= periodStart.getTime()) {
    throw new Error("periodEnd 必须晚于 periodStart")
  }
  if (periodEnd.getTime() - periodStart.getTime() !== WEEK_MS) {
    throw new Error("周复盘周期必须正好 7 天")
  }
}

export function validateReviewCycleDraft(draft: ReviewCycleDraft): ReviewCycleDraft {
  assertValidReviewPeriod(draft.periodStart, draft.periodEnd)
  if (!draft.requestId.trim()) throw new Error("requestId 必填")
  if (!draft.systemOwnerId.trim()) throw new Error("systemOwnerId 必填")
  if (!draft.metricsSnapshot || typeof draft.metricsSnapshot !== "object") {
    throw new Error("metricsSnapshot 必填")
  }
  for (const key of REQUIRED_NUMBER_KEYS) {
    if (!Number.isFinite(draft.metricsSnapshot[key])) {
      throw new Error(`metricsSnapshot.${key} 必须是有限数字`)
    }
  }
  for (const key of NULLABLE_NUMBER_KEYS) {
    const value = draft.metricsSnapshot[key]
    if (value != null && !Number.isFinite(value)) {
      throw new Error(`metricsSnapshot.${key} 必须是有限数字或 null`)
    }
  }
  for (const key of RATE_KEYS) {
    const value = draft.metricsSnapshot[key]
    if (value != null && (value < 0 || value > 1)) {
      throw new Error(`metricsSnapshot.${key} 必须在 0..1`)
    }
  }
  return {
    requestId: draft.requestId.trim(),
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    systemOwnerId: draft.systemOwnerId.trim(),
    metricsSnapshot: draft.metricsSnapshot,
    filterSnapshot: normalizeReviewCycleFilters(draft.filterSnapshot),
  }
}

export function validateReviewActionDraft(draft: ReviewActionDraft): ReviewActionDraft {
  const title = draft.title.trim()
  if (!title) throw new Error("行动项 title 必填")
  if (title.length > 200) throw new Error("行动项 title 过长")
  if (!draft.ownerId.trim()) throw new Error("行动项 ownerId 必填")
  if (!(draft.dueAt instanceof Date) || Number.isNaN(draft.dueAt.getTime())) {
    throw new Error("行动项 dueAt 无效")
  }
  return {
    title,
    ownerId: draft.ownerId.trim(),
    dueAt: draft.dueAt,
    evidenceRef: draft.evidenceRef?.trim() || undefined,
  }
}

/**
 * 签字前置条件：草稿态 + 至少一条行动项 + 有系统 Owner。
 * 签字后状态变为 signed，指标快照视为冻结。
 */
export function canSignReviewCycle(input: {
  status: string
  systemOwnerId: string
  actionCount: number
}): { ok: true } | { ok: false; reason: string } {
  if (input.status !== "draft") return { ok: false, reason: "只有 draft 周期可签字" }
  if (!input.systemOwnerId.trim()) return { ok: false, reason: "缺少 systemOwnerId" }
  if (input.actionCount < 1) return { ok: false, reason: "周复盘必须形成至少一条行动项" }
  return { ok: true }
}

/** 上周行动项关闭率 = done / (open+done+cancelled 中非 cancelled 的分母用 open+done) */
export function computeActionCloseRate(actions: ReviewActionLike[]): number | null {
  const relevant = actions.filter((a) => a.status === "open" || a.status === "done")
  if (relevant.length === 0) return null
  const done = relevant.filter((a) => a.status === "done").length
  return done / relevant.length
}

/**
 * 连续已签字周数是否达到岗位评价接入门槛（默认 4 周）。
 * 只数 signed；draft 不计入。
 */
export function canAttachToPerformanceReview(
  cycles: ReviewCycleLike[],
  requiredSignedWeeks = 4,
): boolean {
  if (!Number.isInteger(requiredSignedWeeks) || requiredSignedWeeks < 1) return false
  const signed = cycles
    .filter((cycle) => cycle.status === "signed" && cycle.signedAt)
    .map((cycle) => ({
      start: new Date(cycle.periodStart).getTime(),
      end: new Date(cycle.periodEnd).getTime(),
    }))
    .filter((cycle) =>
      Number.isFinite(cycle.start)
      && Number.isFinite(cycle.end)
      && cycle.end - cycle.start === WEEK_MS)
    .sort((left, right) => left.start - right.start)
  let consecutive = 0
  let previousStart: number | null = null
  for (const cycle of signed) {
    consecutive =
      previousStart != null && cycle.start - previousStart === WEEK_MS
        ? consecutive + 1
        : 1
    if (consecutive >= requiredSignedWeeks) return true
    previousStart = cycle.start
  }
  return false
}

/** 比率：filled/due；due=0 → null（不当 0） */
export function computeRate(filled: number, due: number): number | null {
  if (!Number.isFinite(filled) || !Number.isFinite(due) || due <= 0) return null
  return Math.max(0, filled) / due
}

/**
 * Trace → Eval/方法论学习候选（WP-6）纯域层。
 *
 * 铁律：LearningCandidate 不得自动写正式 fixture / 方法论 / Skill。
 * 晋升路径：pending → approved → promoted（需人工）；rejected 终止。
 */

export const LEARNING_SOURCE_TYPES = ["trace", "run_event", "content_outcome"] as const
export type LearningSourceType = (typeof LEARNING_SOURCE_TYPES)[number]

export const LEARNING_TARGET_TYPES = [
  "eval_fixture",
  "methodology_revision",
  "skill_draft",
] as const
export type LearningTargetType = (typeof LEARNING_TARGET_TYPES)[number]

export const LEARNING_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "promoted",
] as const
export type LearningReviewStatus = (typeof LEARNING_REVIEW_STATUSES)[number]

export interface LearningCandidateDraft {
  sourceType: LearningSourceType
  sourceId: string
  projectId?: string
  generationId?: string
  targetType: LearningTargetType
  failureCode?: string
  payload: Record<string, unknown>
  /** 幂等键 */
  requestId: string
}

export interface LearningCandidateLike {
  reviewStatus: string
  promotedRef?: string | null
  reviewerId?: string | null
}

export interface LearningQualificationMetrics {
  targetFailureRateBefore: number
  targetFailureRateAfter: number
  acceptanceRateBefore: number
  acceptanceRateAfter: number
  evidenceCompletenessRateBefore: number
  evidenceCompletenessRateAfter: number
  severeHallucinationRate: number
}

const SOURCE_SET = new Set<string>(LEARNING_SOURCE_TYPES)
const TARGET_SET = new Set<string>(LEARNING_TARGET_TYPES)
const STATUS_SET = new Set<string>(LEARNING_REVIEW_STATUSES)
const RATE_EPSILON = 1e-9

/** 自动进入候选的终态：拒绝与重写 */
export const AUTO_CANDIDATE_DISPOSITIONS = ["rejected", "rewrite_requested"] as const

/** 严重失败码（质量/虚构/工具） */
export const SEVERE_FAILURE_CODES = [
  "severe_hallucination",
  "quality_failed",
  "tool_failed",
] as const

export function isLearningSourceType(value: unknown): value is LearningSourceType {
  return typeof value === "string" && SOURCE_SET.has(value)
}

export function isLearningTargetType(value: unknown): value is LearningTargetType {
  return typeof value === "string" && TARGET_SET.has(value)
}

export function isLearningReviewStatus(value: unknown): value is LearningReviewStatus {
  return typeof value === "string" && STATUS_SET.has(value)
}

export function validateLearningCandidateDraft(
  draft: LearningCandidateDraft,
): LearningCandidateDraft {
  if (!isLearningSourceType(draft.sourceType)) throw new Error("sourceType 非法")
  if (!isLearningTargetType(draft.targetType)) throw new Error("targetType 非法")
  if (!draft.sourceId.trim()) throw new Error("sourceId 必填")
  if (!draft.requestId.trim()) throw new Error("requestId 必填")
  if (!draft.payload || typeof draft.payload !== "object" || Array.isArray(draft.payload)) {
    throw new Error("payload 必须是对象")
  }
  return {
    sourceType: draft.sourceType,
    sourceId: draft.sourceId.trim(),
    projectId: draft.projectId?.trim() || undefined,
    generationId: draft.generationId?.trim() || undefined,
    targetType: draft.targetType,
    failureCode: draft.failureCode?.trim() || undefined,
    payload: draft.payload,
    requestId: draft.requestId.trim(),
  }
}

/**
 * 是否应从任务终态自动建候选。
 * 成功任务不在此自动入选（成功走分层抽样）。
 */
export function shouldAutoCreateFromDisposition(disposition: string): boolean {
  return (AUTO_CANDIDATE_DISPOSITIONS as readonly string[]).includes(disposition)
}

export function shouldAutoCreateFromFailureCode(failureCode: string | null | undefined): boolean {
  if (!failureCode) return false
  return (SEVERE_FAILURE_CODES as readonly string[]).includes(failureCode)
}

/**
 * 高成本或异常慢：超过阈值则入候选。
 * costCny / durationMs 任一超阈即触发。
 */
export function shouldAutoCreateFromCostOrLatency(input: {
  costCny?: number | null
  durationMs?: number | null
  costThresholdCny?: number
  durationThresholdMs?: number
}): boolean {
  const costThreshold = input.costThresholdCny ?? 5
  const durationThreshold = input.durationThresholdMs ?? 120_000
  if (typeof input.costCny === "number" && Number.isFinite(input.costCny) && input.costCny >= costThreshold) {
    return true
  }
  if (
    typeof input.durationMs === "number" &&
    Number.isFinite(input.durationMs) &&
    input.durationMs >= durationThreshold
  ) {
    return true
  }
  return false
}

/**
 * 成功任务 10% 分层抽样。
 * 用稳定哈希（sourceId）决定是否入选，避免每次随机漂移。
 */
export function shouldSampleSuccessfulRun(sourceId: string, sampleRate = 0.1): boolean {
  if (!sourceId || sampleRate <= 0) return false
  if (sampleRate >= 1) return true
  let hash = 0
  for (let i = 0; i < sourceId.length; i += 1) {
    hash = (hash * 31 + sourceId.charCodeAt(i)) >>> 0
  }
  return hash % 1000 < Math.floor(sampleRate * 1000)
}

/** 已审核经营结果（成功或失败）可入候选；neutral/unknown 不入 */
export function shouldCreateFromVerdictCode(verdictCode: string | null | undefined): boolean {
  if (!verdictCode) return false
  return (
    verdictCode === "excellent" ||
    verdictCode === "effective" ||
    verdictCode === "ineffective" ||
    verdictCode === "failed"
  )
}

/**
 * 状态机：人工审批。
 * pending → approved | rejected
 * approved → promoted（必须带 promotedRef）
 * 任何状态不得静默写成正式知识；本函数只返回下一状态，不写库。
 */
export function transitionLearningReview(input: {
  current: LearningReviewStatus
  decision: "approve" | "reject" | "promote"
  reviewerId: string
  promotedRef?: string
}): { ok: true; next: LearningReviewStatus; reviewerId: string; promotedRef?: string } | { ok: false; reason: string } {
  if (!input.reviewerId.trim()) return { ok: false, reason: "reviewerId 必填" }

  if (input.decision === "approve") {
    if (input.current !== "pending") return { ok: false, reason: "只有 pending 可批准" }
    return { ok: true, next: "approved", reviewerId: input.reviewerId.trim() }
  }

  if (input.decision === "reject") {
    if (input.current !== "pending" && input.current !== "approved") {
      return { ok: false, reason: "只有 pending/approved 可拒绝" }
    }
    return { ok: true, next: "rejected", reviewerId: input.reviewerId.trim() }
  }

  // promote
  if (input.current !== "approved") return { ok: false, reason: "只有 approved 可晋升" }
  if (!input.promotedRef?.trim()) return { ok: false, reason: "晋升必须提供 promotedRef" }
  return {
    ok: true,
    next: "promoted",
    reviewerId: input.reviewerId.trim(),
    promotedRef: input.promotedRef.trim(),
  }
}

function validRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

/** 灰度发布门禁：目标失败下降≥20%，接受率/证据完整率下降≤5pp，严重虚构=0。 */
export function evaluateLearningQualification(input: {
  deterministicPassed: boolean
  dailyPassed: boolean
  evidenceRef: string
  metrics: LearningQualificationMetrics
}): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = []
  const values = Object.values(input.metrics)
  if (!values.every(validRate)) reasons.push("所有灰度指标必须在 0..1")
  if (!input.deterministicPassed) reasons.push("deterministic Eval 未通过")
  if (!input.dailyPassed) reasons.push("daily Eval 未通过")
  if (!input.evidenceRef.trim()) reasons.push("缺少灰度证据引用")
  if (
    input.metrics.targetFailureRateBefore <= 0
    || input.metrics.targetFailureRateAfter
      > input.metrics.targetFailureRateBefore * 0.8 + RATE_EPSILON
  ) reasons.push("目标失败率下降不足 20%")
  if (
    input.metrics.acceptanceRateBefore
    - input.metrics.acceptanceRateAfter > 0.05 + RATE_EPSILON
  ) reasons.push("接受率下降超过 5 个百分点")
  if (
    input.metrics.evidenceCompletenessRateBefore
    - input.metrics.evidenceCompletenessRateAfter > 0.05 + RATE_EPSILON
  ) reasons.push("证据完整率下降超过 5 个百分点")
  if (input.metrics.severeHallucinationRate !== 0) {
    reasons.push("严重虚构率必须为 0")
  }
  return reasons.length ? { ok: false, reasons } : { ok: true }
}

export function isActivationApprovalAfterQualification(input: {
  approvalDecidedAt?: Date | null
  deterministicPassedAt?: Date | null
  dailyPassedAt?: Date | null
}): boolean {
  if (
    !input.approvalDecidedAt
    || !input.deterministicPassedAt
    || !input.dailyPassedAt
  ) return false
  return input.approvalDecidedAt.getTime() >= Math.max(
    input.deterministicPassedAt.getTime(),
    input.dailyPassedAt.getTime(),
  )
}

/**
 * 守卫：候选记录本身永远不是正式知识写入。
 * promoted 仅表示「已人工批准并指向正式资产引用」，调用方仍需走独立写入 API。
 */
export function assertCandidateCannotWriteFormalKnowledge(
  candidate: LearningCandidateLike,
): void {
  if (candidate.reviewStatus === "pending" || candidate.reviewStatus === "rejected") {
    throw new Error("未批准的学习候选不得写入正式知识/方法论/Skill")
  }
  if (candidate.reviewStatus === "approved" && !candidate.promotedRef) {
    // approved 仍未晋升：禁止当正式写入
    throw new Error("已批准但未晋升的学习候选不得直接写入正式资产")
  }
  if (candidate.reviewStatus === "promoted" && !candidate.promotedRef) {
    throw new Error("promoted 学习候选缺少正式资产引用")
  }
  // promoted：允许调用方按 promotedRef 引用；本守卫不自动写库
}

/** 幂等键：sourceType + sourceId + targetType */
export function buildLearningRequestId(
  sourceType: LearningSourceType,
  sourceId: string,
  targetType: LearningTargetType,
): string {
  return `lc:${sourceType}:${sourceId}:${targetType}`
}

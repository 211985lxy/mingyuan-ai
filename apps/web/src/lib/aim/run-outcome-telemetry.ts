/**
 * 任务最终处置与效率遥测（WP-1）
 * 事件 append-only；终态由 reducer 从最新有效处置事件计算。
 */

export const FINAL_DISPOSITIONS = [
  "accepted_first_pass",
  "accepted_after_edit",
  "rewrite_requested",
  "rejected",
  "abandoned",
] as const

export type FinalDisposition = (typeof FINAL_DISPOSITIONS)[number]

export type RunOutcomeChannel = "web" | "feishu" | "api"

export interface RunOutcomeMetadata {
  workflowId: string
  taskType: string
  finalDisposition: FinalDisposition
  humanActiveMinutes: number
  manualBaselineMinutes?: number
  reasonCode?: string
  channel: RunOutcomeChannel
  /** 幂等键；重复上报同一 requestId 不重复落库 */
  requestId?: string
}

export interface AimRunEventLike {
  event: string
  metadata?: unknown
  createdAt: Date | string
}

const DISPOSITION_SET = new Set<string>(FINAL_DISPOSITIONS)

/** 旧事件映射到终态（兼容已有 accepted/revised/rejected） */
const LEGACY_TO_DISPOSITION: Record<string, FinalDisposition> = {
  accepted: "accepted_first_pass",
  rejected: "rejected",
  rewrite_requested: "rewrite_requested",
  abandoned: "abandoned",
}

export function isFinalDisposition(value: unknown): value is FinalDisposition {
  return typeof value === "string" && DISPOSITION_SET.has(value)
}

export function parseRunOutcomeMetadata(raw: unknown): RunOutcomeMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  if (!isFinalDisposition(obj.finalDisposition)) return null
  if (typeof obj.workflowId !== "string" || !obj.workflowId.trim()) return null
  if (typeof obj.taskType !== "string" || !obj.taskType.trim()) return null
  if (typeof obj.humanActiveMinutes !== "number" || !Number.isFinite(obj.humanActiveMinutes)) return null
  if (obj.channel !== "web" && obj.channel !== "feishu" && obj.channel !== "api") return null
  return {
    workflowId: obj.workflowId.trim(),
    taskType: obj.taskType.trim(),
    finalDisposition: obj.finalDisposition,
    humanActiveMinutes: Math.max(0, obj.humanActiveMinutes),
    manualBaselineMinutes:
      typeof obj.manualBaselineMinutes === "number" && Number.isFinite(obj.manualBaselineMinutes)
        ? Math.max(0, obj.manualBaselineMinutes)
        : undefined,
    reasonCode: typeof obj.reasonCode === "string" ? obj.reasonCode : undefined,
    channel: obj.channel,
    requestId: typeof obj.requestId === "string" ? obj.requestId : undefined,
  }
}

/**
 * 从 append-only 事件还原最新终态。
 * 无终态事件 → unknown（不得当成拒绝或接受）。
 */
export function reduceFinalDisposition(
  events: AimRunEventLike[],
): FinalDisposition | "unknown" {
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  let sawEdit = false
  let latest: FinalDisposition | "unknown" = "unknown"

  for (const item of sorted) {
    if (item.event === "revised" || item.event === "edited") {
      sawEdit = true
    }

    const fromMeta = parseRunOutcomeMetadata(item.metadata)
    if (fromMeta) {
      latest = fromMeta.finalDisposition
      if (latest === "accepted_first_pass" && sawEdit) {
        latest = "accepted_after_edit"
      }
      continue
    }

    if (item.event === "final_disposition") {
      const disposition = (item.metadata as Record<string, unknown> | null)?.finalDisposition
      if (isFinalDisposition(disposition)) {
        latest = disposition === "accepted_first_pass" && sawEdit
          ? "accepted_after_edit"
          : disposition
      }
      continue
    }

    if (isFinalDisposition(item.event)) {
      latest = item.event === "accepted_first_pass" && sawEdit
        ? "accepted_after_edit"
        : item.event
      continue
    }

    const legacy = LEGACY_TO_DISPOSITION[item.event]
    if (legacy) {
      latest = legacy === "accepted_first_pass" && sawEdit
        ? "accepted_after_edit"
        : legacy
    }
  }

  return latest
}

/** 节省时间 = 人工基准 − 实际投入；允许为负 */
export function computeTimeSavedMinutes(
  manualBaselineMinutes: number | null | undefined,
  humanActiveMinutes: number | null | undefined,
): number | null {
  if (manualBaselineMinutes == null || humanActiveMinutes == null) return null
  if (!Number.isFinite(manualBaselineMinutes) || !Number.isFinite(humanActiveMinutes)) return null
  return manualBaselineMinutes - humanActiveMinutes
}

export function computeAcceptanceRate(accepted: number, reviewed: number): number | null {
  if (reviewed <= 0) return null
  return accepted / reviewed
}

export function computeFirstPassAcceptanceRate(
  acceptedFirstPass: number,
  reviewed: number,
): number | null {
  if (reviewed <= 0) return null
  return acceptedFirstPass / reviewed
}

export function computeRewriteRate(rewritten: number, reviewed: number): number | null {
  if (reviewed <= 0) return null
  return rewritten / reviewed
}

export function computeDirectCostPerSuccess(
  totalAiCost: number,
  successCount: number,
): number | null {
  if (successCount <= 0) return null
  return totalAiCost / successCount
}

export function computeFullyLoadedCost(
  aiCost: number,
  humanMinutes: number,
  humanHourlyCostCny: number,
): number {
  return aiCost + (humanMinutes / 60) * humanHourlyCostCny
}

export function isReviewedDisposition(code: FinalDisposition | "unknown"): boolean {
  return code !== "unknown" && code !== "abandoned"
}

export function isAcceptedDisposition(code: FinalDisposition | "unknown"): boolean {
  return code === "accepted_first_pass" || code === "accepted_after_edit"
}

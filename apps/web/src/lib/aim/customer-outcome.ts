/**
 * 客户结果投影域层（WP-4）。
 *
 * 正本在飞书；AIM 只存查询投影。
 * 没有 baseline、actual、证据和审核人 → 不得标记交付成功。
 * 成交只出转化案例（见 outcome-asset-candidates）；已审核客户结果才出成功案例。
 */

import type { AssetCandidateDraft } from "@/lib/aim/asset-candidates"

export const CUSTOMER_OUTCOME_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const
export type CustomerOutcomeReviewStatus = (typeof CUSTOMER_OUTCOME_REVIEW_STATUSES)[number]

export interface CustomerOutcomeProjectionLike {
  id: string
  projectId: string
  externalOutcomeId: string
  externalDealId?: string | null
  metricCode: string
  baseline?: number | string | null
  target?: number | string | null
  actual?: number | string | null
  unit?: string | null
  observedFrom: Date
  observedTo: Date
  evidenceRef: string
  reviewStatus: string
  reviewerRef?: string | null
  reviewedAt?: Date | null
}

function hasNumericValue(value: number | string | null | undefined): boolean {
  if (value == null || value === "") return false
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n)
}

/**
 * @description 是否具备标记「交付成功」的最低证据（baseline + actual + 证据 + 审核人）
 */
export function canMarkDeliverySuccess(row: CustomerOutcomeProjectionLike): boolean {
  return (
    hasNumericValue(row.baseline) &&
    hasNumericValue(row.actual) &&
    Boolean(row.evidenceRef?.trim()) &&
    Boolean(row.reviewerRef?.trim())
  )
}

/**
 * @description 是否已审核通过且证据齐全，可晋升成功案例候选
 */
export function canPromoteSuccessCase(row: CustomerOutcomeProjectionLike): boolean {
  return (
    row.reviewStatus === "approved"
    && canMarkDeliverySuccess(row)
    && Boolean(row.reviewedAt)
  )
}

/**
 * @description 从已审核客户结果生成成功案例候选；证据不足返回 null（不降级为转化案例）
 */
export function buildSuccessCaseCandidateFromCustomerOutcome(
  row: CustomerOutcomeProjectionLike,
  opts?: { customerLabel?: string | null },
): AssetCandidateDraft | null {
  if (!canPromoteSuccessCase(row)) return null

  const label = opts?.customerLabel?.trim() || row.projectId.slice(0, 8)
  const baseline = String(row.baseline)
  const actual = String(row.actual)
  const unit = row.unit?.trim() ? ` ${row.unit.trim()}` : ""
  const evidence = [
    `externalOutcomeId=${row.externalOutcomeId}`,
    `metricCode=${row.metricCode}`,
    `baseline=${baseline}${unit}`,
    `actual=${actual}${unit}`,
    row.target != null && row.target !== "" ? `target=${String(row.target)}${unit}` : "",
    `evidenceRef=${row.evidenceRef.trim()}`,
    `reviewerRef=${row.reviewerRef!.trim()}`,
    row.externalDealId ? `externalDealId=${row.externalDealId}` : "",
  ]
    .filter(Boolean)
    .join("；")

  return {
    kind: "case_candidate",
    title: `成功案例候选：${label}｜${row.metricCode}`,
    content: [
      `客户结果已人工审核通过，可晋升项目案例。`,
      `指标：${row.metricCode}`,
      `基线 → 实际：${baseline}${unit} → ${actual}${unit}`,
      `观察区间：${row.observedFrom.toISOString()} ~ ${row.observedTo.toISOString()}`,
      `证据：${row.evidenceRef.trim()}`,
      `审核人：${row.reviewerRef!.trim()}`,
      "说明：成交信号本身不得直接生成本条；须有已审核客户结果。",
    ].join("\n\n"),
    evidence,
    confidence: "high",
    crossProjectAllowed: false,
  }
}

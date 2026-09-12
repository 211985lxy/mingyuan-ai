/**
 * 复盘归因 loop（WP-3.3）。
 *
 * 照 sales-diagnosis 8 步：校验 → 装上下文 → 出初稿 → 验证 → 落库占位 →
 * 人工终审 → 通知占位 → 记忆候选占位。
 * 默认 shadow。读 WP-2.1 指标层，不写经营正本、不外发。
 */

import type { OperatingLedger } from "@/lib/aim/metric-layer"
import { LOOP_STEP_IDS, type LoopStepId } from "@/lib/aim/loops/contracts"

export const REVIEW_ATTRIBUTION_LOOP_STEPS: readonly LoopStepId[] = LOOP_STEP_IDS

export function isReviewAttributionLoopLive(): boolean {
  return (
    process.env.AIM_BUSINESS_LOOPS_ENABLED === "true" &&
    process.env.AIM_LOOP_SHADOW_MODE === "false"
  )
}

export function draftWeeklyReviewFromLedger(ledger: OperatingLedger): string {
  const c = ledger.canonical
  const fill = c.day7Backfill.due > 0
    ? `${c.day7Backfill.filled}/${c.day7Backfill.due}`
    : "窗口未到期"
  return [
    "【周复盘初稿】人工终审后才能外发。",
    `发布 ${c.publishedCount} 条。`,
    `可追溯线索 ${c.traceableLeadCount}，来源不明 ${c.unknownLeadCount}。`,
    `预约 ${c.appointmentCount}，成交 ${c.dealCount}。`,
    `第 7 天回填 ${fill}。`,
    "金额与判断码仍以人工登记为准，本稿不猜测。",
  ].join("\n")
}

export function runReviewAttributionLoopShadow(ledger: OperatingLedger): {
  shadow: true
  live: boolean
  steps: LoopStepId[]
  draft: string
} {
  return {
    shadow: true,
    live: isReviewAttributionLoopLive(),
    steps: [...REVIEW_ATTRIBUTION_LOOP_STEPS],
    draft: draftWeeklyReviewFromLedger(ledger),
  }
}

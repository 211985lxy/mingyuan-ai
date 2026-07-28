import { recordAimRunEvent } from "@/lib/api/client"
import type { FinalDisposition, RunOutcomeMetadata } from "@/lib/aim/run-outcome-telemetry"

type LegacyRunEvent =
  | "copied"
  | "revised"
  | "accepted"
  | "edited"
  | "published"
  | "retrospected"
  | "partially_satisfied"
  | "rewrite_requested"
  | "rejected"
  | "abandoned"
  | "final_disposition"
  | FinalDisposition

/**
 * @description 上报 AIM 运行事件（复制、修改、接受、终态处置）
 */
export function reportAimRunEvent(
  runId: string | null | undefined,
  event: LegacyRunEvent,
  metadata?: Record<string, unknown>,
) {
  if (!runId) return
  void recordAimRunEvent(runId, event, metadata).catch(() => undefined)
}

/** 上报最终处置（WP-1）；写入 final_disposition 事件 */
export function reportFinalDisposition(
  runId: string | null | undefined,
  outcome: RunOutcomeMetadata,
) {
  reportAimRunEvent(runId, "final_disposition", { ...outcome })
}

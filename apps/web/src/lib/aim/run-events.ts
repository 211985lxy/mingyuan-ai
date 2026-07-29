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

/** Critical WP-1 telemetry: retry once with the same requestId and surface final failure. */
export async function reportRequiredAimRunEvent(
  runId: string,
  event: LegacyRunEvent,
  metadata: Record<string, unknown>,
) {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await recordAimRunEvent(runId, event, metadata)
      return
    } catch (error) {
      lastError = error
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }
  }
  throw lastError
}

/** 上报最终处置（WP-1）；写入 final_disposition 事件 */
export async function reportFinalDisposition(
  runId: string,
  outcome: RunOutcomeMetadata,
) {
  await reportRequiredAimRunEvent(runId, "final_disposition", { ...outcome })
}

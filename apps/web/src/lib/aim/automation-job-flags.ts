import type { AutomationJobId } from "@/lib/aim/automation-ledger-catalog"
import { env } from "@/env"

export const JOB_FLAG_KEY_PREFIX = "automation.job."

export function jobEnabledSettingKey(jobId: AutomationJobId): string {
  return `${JOB_FLAG_KEY_PREFIX}${jobId}.enabled`
}

export function parseDisabledJobIds(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set()
  return new Set(
    raw.split(",").map((item) => item.trim()).filter(Boolean),
  )
}

/** env 灰度：AIM_JOB_DISABLED=topic-daily,cleanup 表示这些任务空转。默认全开。 */
export function isJobEnabledByEnv(
  jobId: AutomationJobId,
  disabledRaw = env.AIM_JOB_DISABLED,
): boolean {
  return !parseDisabledJobIds(disabledRaw).has(jobId)
}

export function isJobEnabledByOverlay(
  jobId: AutomationJobId,
  overlay: Map<string, string>,
  disabledRaw?: string,
): boolean {
  const overlayValue = overlay.get(jobEnabledSettingKey(jobId))
  if (overlayValue === "false") return false
  if (overlayValue === "true") return true
  return isJobEnabledByEnv(jobId, disabledRaw)
}

export function mutexSlot(now: Date, windowMs = 5 * 60 * 1000): number {
  return Math.floor(now.getTime() / windowMs)
}

export function mutexKey(jobId: string, now: Date, windowMs = 5 * 60 * 1000): string {
  return `automation-ledger-run:${jobId}:${mutexSlot(now, windowMs)}`
}

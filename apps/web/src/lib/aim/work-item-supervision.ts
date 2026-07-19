import type { LoopStopReason } from "@/lib/aim/loops/contracts"
import { supervisedFailureSummary } from "@/lib/aim/feishu-supervisor-notifier"
import { DISPATCH_FIELDS, SUPERVISION_FIELDS } from "@/lib/aim/work-item-dispatch"
import type { SupervisorNotification } from "@/lib/aim/feishu-supervisor-notifier"

type SupervisionPorts = {
  notify(notification: SupervisorNotification): Promise<void>
  releaseClaim(token: unknown): Promise<void>
}

type SupervisionSummary = {
  errors: Array<{ recordId: string; error: string }>
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function notifySafely(
  ports: SupervisionPorts,
  summary: SupervisionSummary,
  notification: SupervisorNotification,
): Promise<void> {
  try {
    await ports.notify(notification)
  } catch (error) {
    summary.errors.push({ recordId: notification.recordId, error: `通知负责人失败：${describeError(error)}` })
  }
}

export async function releasePreExecutionClaim(
  ports: SupervisionPorts,
  token: unknown,
  recordId: string,
  summary: SupervisionSummary,
): Promise<boolean> {
  try {
    await ports.releaseClaim(token)
    return true
  } catch (error) {
    summary.errors.push({ recordId, error: `释放未执行 Trace 失败：${describeError(error)}` })
    return false
  }
}

export function buildClaimSupervisionPatch(runId: string, currentStep: string) {
  return {
    [DISPATCH_FIELDS.lastRunId]: runId,
    [SUPERVISION_FIELDS.currentStep]: currentStep,
    [SUPERVISION_FIELDS.verificationStatus]: "未验证",
    [SUPERVISION_FIELDS.verificationSummary]: "",
  }
}

export function buildRetrySupervisionPatch() {
  return { [SUPERVISION_FIELDS.currentStep]: "等待自动重试" }
}

export function buildFailureSupervisionPatch(stopReason: LoopStopReason, retryable: boolean) {
  const summaryReason = retryable ? "retry_exhausted" : stopReason
  return {
    [SUPERVISION_FIELDS.currentStep]: "人工接管",
    [SUPERVISION_FIELDS.verificationStatus]: stopReason === "verification_failed" ? "未通过" : "需人工判断",
    [SUPERVISION_FIELDS.verificationSummary]: supervisedFailureSummary(summaryReason),
  }
}

export function buildReviewSupervisionPatch(input: {
  verificationStatus?: "pass" | "needs_human"
  verificationSummary?: string
}) {
  return {
    [SUPERVISION_FIELDS.currentStep]: "人工审核",
    [SUPERVISION_FIELDS.verificationStatus]: input.verificationStatus === "needs_human" ? "需人工判断" : "通过",
    [SUPERVISION_FIELDS.verificationSummary]: input.verificationSummary || "确定性检查已完成。",
  }
}

import { parseMeetingWorkItemInput } from "@/lib/aim-feishu-work-item"
import { runMeetingInsightWorkflow, type InsightResultSink } from "@/lib/aim/meeting-workflow"
import { classifyDispatchRetry } from "@/lib/aim/work-item-dispatch-retry"
import type { AimTraceRecorder } from "@/lib/aim-observability"
import type {
  DispatchExecutionContext,
  DispatchExecuteOutcome,
} from "@/lib/aim/services/work-item-dispatcher"
import type { WorkItemRecordStore } from "@/lib/aim/services/work-item-execution"

function requireClaimedTrace(token: unknown): AimTraceRecorder {
  if (!token || typeof token !== "object") throw new Error("调度 claim 未返回 Trace。")
  const trace = token as Partial<AimTraceRecorder>
  if (typeof trace.id !== "string" || typeof trace.startedAt !== "number") {
    throw new Error("调度 claim 返回的 Trace 无效。")
  }
  return trace as AimTraceRecorder
}

/**
 * @description 执行meetingworkitem
 * @param input - 输入数据
 * @returns Promise<DispatchExecuteOutcome>
 */
export async function executeMeetingWorkItem(input: {
  store: WorkItemRecordStore
  resultSink: InsightResultSink
  ownerUserId: string
  recordId: string
  context: DispatchExecutionContext
  findProjectOwner(projectId: string): Promise<string | null>
}): Promise<DispatchExecuteOutcome> {
  if (input.context.loop.id !== "sales-diagnosis-v1") {
    return { ok: false, error: `尚未配置 ${input.context.loop.id} 的执行处理器。`, retryable: false, stopReason: "missing_input" }
  }

  let record
  try {
    record = await input.store.get(input.recordId)
  } catch (error) {
    return { ok: false, error: `读取经营事项失败：${error instanceof Error ? error.message : String(error)}`, retryable: false, stopReason: "human_required" }
  }
  if (!record) return { ok: false, error: `经营事项记录不存在：${input.recordId}`, retryable: false, stopReason: "missing_input" }

  const workItem = parseMeetingWorkItemInput(record.fields)
  if (!workItem.transcript) return { ok: false, error: "会议原文（输入内容）为空，禁止凭空抽取", retryable: false, stopReason: "missing_input" }
  if (!workItem.projectId) return { ok: false, error: "缺少 AIM项目ID，客户会议必须绑定项目", retryable: false, stopReason: "missing_input" }

  let projectOwner: string | null
  try {
    projectOwner = await input.findProjectOwner(workItem.projectId)
  } catch {
    return { ok: false, error: "项目归属校验失败", retryable: false, stopReason: "human_required" }
  }
  if (projectOwner !== input.ownerUserId) {
    return { ok: false, error: "项目不存在或不属于经营事项负责人", retryable: false, stopReason: "human_required" }
  }
  if (!workItem.meetingTitle || !workItem.customer) {
    return {
      ok: false,
      error: `会议标题/客户名称缺失（标题=${workItem.meetingTitle || "空"}，客户=${workItem.customer || "空"}），请先在飞书补齐`,
      retryable: false,
      stopReason: "missing_input",
    }
  }

  const result = await runMeetingInsightWorkflow(
    { recordId: input.recordId, ...workItem, actorId: input.ownerUserId, attempt: input.context.attempt, traceId: input.context.runId },
    { store: input.store, resultSink: input.resultSink, claimedTrace: requireClaimedTrace(input.context.claimToken) },
  )
  if (result.ok) {
    return {
      ok: true,
      verificationStatus: result.verificationStatus,
      verificationSummary: result.verificationSummary,
      nextAction: result.nextAction,
      resultLink: result.resultLink,
    }
  }
  if (result.stopReason === "verification_failed") return { ok: false, error: result.error, retryable: false, stopReason: "verification_failed" }
  if (result.stopReason === "duplicate_suppressed") return { ok: true, duplicateSuppressed: true }
  const classified = classifyDispatchRetry(result.error)
  return { ok: false, error: result.error, retryable: classified.retryable, stopReason: classified.stopReason }
}

/**
 * WP-8 无人值守执行调度（90 天计划 6.1）。
 *
 * 流程：扫描待处理记录 → 跳过租约活跃/重试未到期/非待处理 → 获取执行租约 →
 * 带超时执行（幂等键 = 记录ID:操作类型）→ 成功释放租约；失败按指数退避重试，
 * 重试次数达上限则进入失败态并标记「需人工接管」、通知飞书负责人。
 *
 * 边界：
 * - 自动化只能推进内部状态，不能自动对客户发送、报价、发布或删除。
 * - execute 端口由调用方注入（如会议洞察工作流），本模块不臆造业务字段契约。
 * - 通知失败不拖垮调度；任何单记录异常都计入 errors 并继续后续记录。
 */
import {
  DISPATCH_FIELDS,
  DEFAULT_LEASE_TTL_MS,
  buildIdempotencyKey,
  buildLeaseAcquirePatch,
  buildLeaseReleasePatch,
  isLeaseActive,
  isRetryDue,
  parseRetryCount,
  planExecutionFailure,
} from "@/lib/aim/work-item-dispatch"
import { sha256 } from "@/lib/aim-harness/hashing"
import { parseFeishuWorkItem } from "@/lib/aim-feishu-work-item"
import { supervisedFailureSummary, type SupervisorNotification } from "@/lib/aim/feishu-supervisor-notifier"
import type { LoopStopReason } from "@/lib/aim/loops/contracts"
import type { BusinessLoopSpec } from "@/lib/aim/loops/contracts"
import { getRegisteredLoop } from "@/lib/aim/loops/registry"
import {
  failWorkItem,
  retryWorkItem,
  startWorkItem,
  type WorkItemRecord,
  type WorkItemRecordStore,
} from "@/lib/aim/services/work-item-execution"

export type DispatchExecuteOutcome =
  | { ok: true; duplicateSuppressed?: boolean; verificationStatus?: "pass" | "needs_human"; resultLink?: string }
  | { ok: false; error: string; retryable: boolean; stopReason: LoopStopReason }

export interface DispatchExecutionContext {
  loop: BusinessLoopSpec
  idempotencyKey: string
  attempt: number
  runId: string
  claimToken?: unknown
}

export interface DispatchClaimContext {
  loopId: string
  loopVersion: number | null
  projectId: string
  idempotencyKey: string
  attempt: number
  runId: string
}

export type DispatchClaimResult = { acquired: true; token?: unknown } | { acquired: false }

export interface WorkItemDispatcherPorts {
  store: WorkItemRecordStore
  /** 扫描待处理候选记录（由调用方绑定真实飞书列表能力）。 */
  listPending(limit: number): Promise<WorkItemRecord[]>
  /** 单记录的实际执行体；必须幂等（幂等键已透传）。 */
  execute(recordId: string, context: DispatchExecutionContext): Promise<DispatchExecuteOutcome>
  /** 具有唯一约束的原子领取；必须发生在任何飞书写入之前。 */
  claim(recordId: string, context: DispatchClaimContext): Promise<DispatchClaimResult>
  /** claim 后、工作流接管前失败时关闭运行记录。 */
  failClaim(token: unknown, error: string): Promise<void>
  /** claim 后、工作流接管前的飞书写入失败时释放唯一键，允许安全重试。 */
  releaseClaim(token: unknown): Promise<void>
  /** 仅发送监督事件；通知失败不得改变经营事项状态。 */
  notify(notification: SupervisorNotification): Promise<void>
  now(): Date
  /** 租约持有者标识（通常为执行主机/cron 实例名）。 */
  holderId: string
  leaseTtlMs?: number
  resolveLoop?: typeof getRegisteredLoop
}

export interface WorkItemDispatchSummary {
  scanned: number
  started: number
  succeeded: number
  failed: number
  escalated: number
  skippedLeased: number
  skippedNotDue: number
  skippedNotPending: number
  duplicatesSuppressed: number
  errors: Array<{ recordId: string; error: string }>
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function releasePreExecutionClaim(
  ports: WorkItemDispatcherPorts,
  token: unknown,
  recordId: string,
  summary: WorkItemDispatchSummary,
): Promise<boolean> {
  try {
    await ports.releaseClaim(token)
    return true
  } catch (error) {
    summary.errors.push({ recordId, error: `释放未执行 Trace 失败：${describeError(error)}` })
    return false
  }
}

async function notifySafely(
  ports: WorkItemDispatcherPorts,
  summary: WorkItemDispatchSummary,
  notification: SupervisorNotification,
): Promise<void> {
  try {
    await ports.notify(notification)
  } catch (error) {
    summary.errors.push({
      recordId: notification.recordId,
      error: `通知负责人失败：${describeError(error)}`,
    })
  }
}

export function buildDispatchRunId(
  recordId: string,
  loop: BusinessLoopSpec,
  previousRunId: string,
): string {
  return `loop_run_${sha256(`${recordId}|${loop.id}|${loop.version}|${previousRunId || "root"}`).slice(0, 28)}`
}

function buildRawDispatchRunId(
  recordId: string,
  loopId: string,
  loopVersion: number | null,
  previousRunId: string,
): string {
  return `loop_run_${sha256(`${recordId}|${loopId || "missing"}|${loopVersion ?? "missing"}|${previousRunId || "root"}`).slice(0, 28)}`
}

async function handleFailure(
  ports: WorkItemDispatcherPorts,
  record: WorkItemRecord,
  error: string,
  summary: WorkItemDispatchSummary,
  retryable: boolean,
  stopReason: LoopStopReason,
  maxAutoRetries: number,
  loopId: string,
  runId: string,
): Promise<void> {
  const now = ports.now()
  if (retryable) {
    const plan = planExecutionFailure(record.fields, now, maxAutoRetries)
    if (plan.kind === "retry") {
      const failed = await failWorkItem(ports.store, record.recordId, { errorMessage: error })
      if (!failed.ok) throw new Error(failed.error)
      const retried = await retryWorkItem(ports.store, record.recordId)
      if (!retried.ok) throw new Error(retried.error)
      await ports.store.update(record.recordId, {
        [DISPATCH_FIELDS.retryCount]: plan.patch[DISPATCH_FIELDS.retryCount],
        [DISPATCH_FIELDS.nextRetryAt]: plan.patch[DISPATCH_FIELDS.nextRetryAt],
        ...buildLeaseReleasePatch(),
        [DISPATCH_FIELDS.stopReason]: stopReason,
        [DISPATCH_FIELDS.nextAction]: "等待自动重试",
      })
      summary.failed += 1
      summary.errors.push({ recordId: record.recordId, error })
      if (stopReason === "execution_timeout") {
        await notifySafely(ports, summary, {
          type: "execution_timeout",
          recordId: record.recordId,
          loopId,
          runId,
          summary: supervisedFailureSummary(stopReason),
          nextAction: "等待自动重试",
        })
      }
      return
    }
  }

  // 升级人工接管：写失败态（可行动错误）+ 标记 + 通知负责人。
  const failed = await failWorkItem(ports.store, record.recordId, { errorMessage: error })
  if (!failed.ok) {
    summary.errors.push({ recordId: record.recordId, error })
    summary.errors.push({ recordId: record.recordId, error: `失败状态回写失败：${failed.error}` })
    return
  }
  await ports.store.update(record.recordId, {
    [DISPATCH_FIELDS.needsHuman]: true,
    [DISPATCH_FIELDS.stopReason]: retryable ? "retry_exhausted" : stopReason,
    [DISPATCH_FIELDS.nextAction]: "人工接管处理",
    ...buildLeaseReleasePatch(),
  })
  summary.escalated += 1
  summary.errors.push({ recordId: record.recordId, error })
  await notifySafely(ports, summary, {
    type: stopReason === "execution_timeout" ? "execution_timeout" : "manual_takeover",
    recordId: record.recordId,
    loopId,
    runId,
    summary: supervisedFailureSummary(retryable ? "retry_exhausted" : stopReason),
    nextAction: "人工接管处理",
  })
}

/**
 * 扫描并执行待处理经营事项，返回本次调度摘要。
 */
export async function dispatchPendingWorkItems(
  ports: WorkItemDispatcherPorts,
  limit = 10,
): Promise<WorkItemDispatchSummary> {
  const summary: WorkItemDispatchSummary = {
    scanned: 0,
    started: 0,
    succeeded: 0,
    failed: 0,
    escalated: 0,
    skippedLeased: 0,
    skippedNotDue: 0,
    skippedNotPending: 0,
    duplicatesSuppressed: 0,
    errors: [],
  }
  const now = ports.now()

  const candidates = await ports.listPending(limit)
  summary.scanned = candidates.length

  for (const candidate of candidates) {
    let record: WorkItemRecord | null
    try {
      record = await ports.store.get(candidate.recordId)
    } catch (error) {
      summary.errors.push({ recordId: candidate.recordId, error: describeError(error) })
      continue
    }
    if (!record) {
      summary.errors.push({ recordId: candidate.recordId, error: "记录不存在或已被删除" })
      continue
    }

    if (isLeaseActive(record.fields, now)) {
      summary.skippedLeased += 1
      continue
    }
    if (!isRetryDue(record.fields, now)) {
      summary.skippedNotDue += 1
      continue
    }
    const parsed = parseFeishuWorkItem(record.fields)
    if (parsed.status !== "待处理") {
      summary.skippedNotPending += 1
      continue
    }

    let loop: BusinessLoopSpec
    try {
      loop = (ports.resolveLoop ?? getRegisteredLoop)(parsed.loopId)
      if (parsed.loopVersion !== loop.version) {
        throw new Error(`Loop 版本不匹配：记录=${parsed.rawLoopVersion || "空"}，注册表=${loop.version}`)
      }
    } catch (error) {
      const message = `经营事项 Loop 配置无效：${describeError(error)}`
      const runId = buildRawDispatchRunId(
        record.recordId,
        parsed.loopId,
        parsed.loopVersion,
        parsed.lastRunId,
      )
      let invalidClaim: DispatchClaimResult
      try {
        invalidClaim = await ports.claim(record.recordId, {
          loopId: parsed.loopId,
          loopVersion: parsed.loopVersion,
          projectId: parsed.aimProjectId,
          idempotencyKey: buildIdempotencyKey(record.recordId, parsed.loopId || "invalid_loop"),
          attempt: parseRetryCount(record.fields) + 1,
          runId,
        })
      } catch (claimError) {
        summary.errors.push({ recordId: record.recordId, error: `原子领取运行失败：${describeError(claimError)}` })
        continue
      }
      if (!invalidClaim.acquired) {
        summary.duplicatesSuppressed += 1
        continue
      }
      // 持久化哈希链必须紧随原子 claim；即使后续飞书启动失败，人工修复后也能生成新 runId，
      // 不会永远撞上已失败的 Trace 唯一键。
      try {
        await ports.store.update(record.recordId, { [DISPATCH_FIELDS.lastRunId]: runId })
      } catch (writeError) {
        const message = `持久化最后运行ID失败：${describeError(writeError)}`
        await releasePreExecutionClaim(ports, invalidClaim.token, record.recordId, summary)
        summary.errors.push({ recordId: record.recordId, error: message })
        continue
      }
      const started = await startWorkItem(ports.store, record.recordId)
      if (!started.ok) {
        await releasePreExecutionClaim(ports, invalidClaim.token, record.recordId, summary)
        summary.errors.push({ recordId: record.recordId, error: started.error })
        continue
      }
      summary.started += 1
      await handleFailure(
        ports,
        record,
        message,
        summary,
        false,
        "missing_input",
        0,
        parsed.loopId || "invalid-loop",
        runId,
      )
      await ports.failClaim(invalidClaim.token, message)
      continue
    }

    const runId = buildDispatchRunId(record.recordId, loop, parsed.lastRunId)
    const claimContext: DispatchClaimContext = {
      loopId: loop.id,
      loopVersion: loop.version,
      projectId: parsed.aimProjectId,
      idempotencyKey: buildIdempotencyKey(record.recordId, loop.id),
      attempt: parseRetryCount(record.fields) + 1,
      runId,
    }
    let claim: DispatchClaimResult
    try {
      claim = await ports.claim(record.recordId, claimContext)
    } catch (error) {
      summary.errors.push({ recordId: record.recordId, error: `原子领取运行失败：${describeError(error)}` })
      continue
    }
    if (!claim.acquired) {
      summary.duplicatesSuppressed += 1
      continue
    }

    // 原子 claim 成功后才允许开始处理或写入飞书租约。
    try {
      await ports.store.update(record.recordId, { [DISPATCH_FIELDS.lastRunId]: runId })
    } catch (writeError) {
      const message = `持久化最后运行ID失败：${describeError(writeError)}`
      await releasePreExecutionClaim(ports, claim.token, record.recordId, summary)
      summary.errors.push({ recordId: record.recordId, error: message })
      continue
    }
    const started = await startWorkItem(ports.store, record.recordId)
    if (!started.ok) {
      await releasePreExecutionClaim(ports, claim.token, record.recordId, summary)
      summary.errors.push({ recordId: record.recordId, error: started.error })
      continue
    }
    summary.started += 1
    try {
      await ports.store.update(
        record.recordId,
        buildLeaseAcquirePatch(ports.holderId, now, ports.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS),
      )
    } catch (writeError) {
      const message = `获取飞书执行租约失败：${describeError(writeError)}`
      await releasePreExecutionClaim(ports, claim.token, record.recordId, summary)
      await handleFailure(
        ports,
        record,
        message,
        summary,
        false,
        "human_required",
        0,
        loop.id,
        runId,
      )
      continue
    }

    let outcome: DispatchExecuteOutcome
    try {
      outcome = await ports.execute(record.recordId, {
        loop,
        idempotencyKey: claimContext.idempotencyKey,
        attempt: claimContext.attempt,
        runId,
        claimToken: claim.token,
      })
    } catch (error) {
      outcome = {
        ok: false,
        error: describeError(error),
        retryable: false,
        stopReason: "human_required",
      }
    }

    if (outcome.ok) {
      if (outcome.duplicateSuppressed) {
        summary.duplicatesSuppressed += 1
        continue
      }
      await ports.store.update(record.recordId, {
        ...buildLeaseReleasePatch(),
        [DISPATCH_FIELDS.retryCount]: 0,
        [DISPATCH_FIELDS.nextRetryAt]: null,
        [DISPATCH_FIELDS.needsHuman]: false,
        [DISPATCH_FIELDS.stopReason]: "",
        [DISPATCH_FIELDS.nextAction]: "等待人工审核",
      })
      await notifySafely(ports, summary, {
        type: outcome.verificationStatus === "needs_human" ? "human_judgment" : "review_required",
        recordId: record.recordId,
        loopId: loop.id,
        runId,
        summary: outcome.verificationStatus === "needs_human"
          ? "销售诊断已生成，但存在需人工判断的信息缺口。"
          : "销售诊断已生成并通过确定性检查。",
        nextAction: "在飞书待我审核视图中完成终审",
        resultLink: outcome.resultLink,
      })
      summary.succeeded += 1
      continue
    }

    await ports.failClaim(claim.token, outcome.error)
    const budget = loop.supervisionPolicy.budget
    const maxAutoRetries = Math.min(budget.maxAutoRetries, Math.max(0, budget.maxRunsPerWorkItem - 1))
    await handleFailure(
      ports,
      record,
      outcome.error,
      summary,
      outcome.retryable,
      outcome.stopReason,
      maxAutoRetries,
      loop.id,
      runId,
    )
  }

  return summary
}

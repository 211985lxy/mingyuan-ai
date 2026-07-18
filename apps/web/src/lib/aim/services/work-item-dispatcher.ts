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
  EXECUTION_TIMEOUT_MS,
  buildIdempotencyKey,
  buildLeaseAcquirePatch,
  buildLeaseReleasePatch,
  isLeaseActive,
  isRetryDue,
  planExecutionFailure,
} from "@/lib/aim/work-item-dispatch"
import { parseFeishuWorkItem } from "@/lib/aim-feishu-work-item"
import {
  failWorkItem,
  startWorkItem,
  type WorkItemRecord,
  type WorkItemRecordStore,
} from "@/lib/aim/services/work-item-execution"

export type DispatchExecuteOutcome = { ok: true } | { ok: false; error: string }

export interface WorkItemDispatcherPorts {
  store: WorkItemRecordStore
  /** 扫描待处理候选记录（由调用方绑定真实飞书列表能力）。 */
  listPending(limit: number): Promise<WorkItemRecord[]>
  /** 单记录的实际执行体；必须幂等（幂等键已透传）。 */
  execute(recordId: string, idempotencyKey: string): Promise<DispatchExecuteOutcome>
  /** 失败/超时/配置异常通知飞书负责人。 */
  notify(message: string): Promise<void>
  now(): Date
  /** 租约持有者标识（通常为执行主机/cron 实例名）。 */
  holderId: string
  /** 操作类型（幂等键组成部分），缺省为会议洞察。 */
  action?: string
  leaseTtlMs?: number
  executionTimeoutMs?: number
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
  errors: Array<{ recordId: string; error: string }>
}

const DEFAULT_ACTION = "meeting_insight"

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`执行超时（${ms}ms）`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function handleFailure(
  ports: WorkItemDispatcherPorts,
  record: WorkItemRecord,
  error: string,
  summary: WorkItemDispatchSummary,
): Promise<void> {
  const now = ports.now()
  const plan = planExecutionFailure(record.fields, now)
  if (plan.kind === "retry") {
    await ports.store.update(record.recordId, plan.patch)
    summary.failed += 1
    summary.errors.push({ recordId: record.recordId, error })
    return
  }

  // 升级人工接管：写失败态（可行动错误）+ 标记 + 通知负责人。
  await failWorkItem(ports.store, record.recordId, { errorMessage: error })
  await ports.store.update(record.recordId, {
    [DISPATCH_FIELDS.needsHuman]: true,
    ...buildLeaseReleasePatch(),
  })
  summary.escalated += 1
  summary.errors.push({ recordId: record.recordId, error })
  try {
    await ports.notify(
      `经营事项连续失败，需人工接管：${record.recordId}\n最后错误：${error}`,
    )
  } catch (notifyError) {
    summary.errors.push({
      recordId: record.recordId,
      error: `通知负责人失败：${describeError(notifyError)}`,
    })
  }
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
    errors: [],
  }
  const action = ports.action ?? DEFAULT_ACTION
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

    // 获取租约：先推进 待处理→处理中（幂等感知），再写租约字段。
    const started = await startWorkItem(ports.store, record.recordId)
    if (!started.ok) {
      summary.errors.push({ recordId: record.recordId, error: started.error })
      continue
    }
    summary.started += 1
    await ports.store.update(
      record.recordId,
      buildLeaseAcquirePatch(ports.holderId, now, ports.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS),
    )

    let outcome: DispatchExecuteOutcome
    try {
      outcome = await withTimeout(
        ports.execute(record.recordId, buildIdempotencyKey(record.recordId, action)),
        ports.executionTimeoutMs ?? EXECUTION_TIMEOUT_MS,
      )
    } catch (error) {
      outcome = { ok: false, error: describeError(error) }
    }

    if (outcome.ok) {
      await ports.store.update(record.recordId, buildLeaseReleasePatch())
      summary.succeeded += 1
      continue
    }

    await handleFailure(ports, record, outcome.error, summary)
  }

  return summary
}

/**
 * WP-8 无人值守执行（90 天计划 6.1）纯域层。
 *
 * - 幂等键：记录 ID + 操作类型（重复执行同一记录不得重复消耗模型或重复创建结果）
 * - 执行租约：写「执行租约截止/持有者」字段，避免两台进程同时处理同一记录
 * - 指数退避重试：单次执行超时/失败后最多重试 3 次（1 / 5 / 15 分钟）
 * - 连续失败升级：重试次数达上限仍失败 → 需人工接管，通知飞书负责人
 *
 * 本层不读写飞书、不接触 LLM；租约与重试状态落在经营事项记录字段上。
 * 自动化只能推进内部状态，不能自动对客户发送、报价、发布或删除。
 */

/** 调度状态使用的飞书字段名（生产表需预先创建这些列）。 */
export const DISPATCH_FIELDS = {
  leaseUntil: "执行租约截止",
  leaseHolder: "执行租约持有者",
  retryCount: "重试次数",
  nextRetryAt: "下次重试时间",
  needsHuman: "需人工接管",
  stopReason: "停止原因",
  nextAction: "下一步动作",
  lastRunId: "最后运行ID",
} as const

export const SUPERVISION_FIELDS = {
  currentStep: "当前步骤",
  verificationStatus: "验证状态",
  verificationSummary: "验证摘要",
} as const

/** 默认租约时长：10 分钟（覆盖一次会议洞察抽取的执行窗口）。 */
export const DEFAULT_LEASE_TTL_MS = 10 * 60_000
/** 单次执行超时：5 分钟。 */
export const EXECUTION_TIMEOUT_MS = 5 * 60_000
/** 最多重试 3 次（不含首次执行）。 */
export const MAX_EXECUTION_RETRIES = 3
/** 指数退避：1 / 5 / 15 分钟。 */
export const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000] as const

/**
 * @description 构建幂等键（记录 ID + 操作类型）
 * @param recordId - 记录 ID
 * @param action - 操作类型
 * @returns 幂等键字符串
 */
export function buildIdempotencyKey(recordId: string, action: string): string {
  return `${recordId.trim()}:${action.trim()}`
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

/**
 * @description 判断租约是否活跃
 * @param fields - 字段记录
 * @param now - 当前时间
 * @returns 租约活跃返回 true
 */
export function isLeaseActive(fields: Record<string, unknown>, now: Date): boolean {
  const until = asFiniteNumber(fields[DISPATCH_FIELDS.leaseUntil])
  return until != null && until > now.getTime()
}

/**
 * @description 判断下次重试时间是否已到期
 * @param fields - 字段记录
 * @param now - 当前时间
 * @returns 已到期返回 true
 */
export function isRetryDue(fields: Record<string, unknown>, now: Date): boolean {
  const nextAt = asFiniteNumber(fields[DISPATCH_FIELDS.nextRetryAt])
  return nextAt == null || nextAt <= now.getTime()
}

/**
 * @description 解析已完成的重试次数
 * @param fields - 字段记录
 * @returns 重试次数
 */
export function parseRetryCount(fields: Record<string, unknown>): number {
  const value = asFiniteNumber(fields[DISPATCH_FIELDS.retryCount])
  return value != null && value > 0 ? Math.trunc(value) : 0
}

/**
 * @description 构建租约获取 patch
 * @param holderId - 持有者 ID
 * @param now - 当前时间
 * @param ttlMs - 租约 TTL（毫秒）
 * @returns 租约 patch 对象
 */
export function buildLeaseAcquirePatch(
  holderId: string,
  now: Date,
  ttlMs: number = DEFAULT_LEASE_TTL_MS,
): Record<string, unknown> {
  return {
    [DISPATCH_FIELDS.leaseUntil]: now.getTime() + ttlMs,
    [DISPATCH_FIELDS.leaseHolder]: holderId.trim(),
  }
}

/**
 * @description 构建租约释放 patch
 * @returns 租约释放 patch 对象
 */
export function buildLeaseReleasePatch(): Record<string, unknown> {
  return {
    [DISPATCH_FIELDS.leaseUntil]: null,
    [DISPATCH_FIELDS.leaseHolder]: "",
  }
}

export type ExecutionFailurePlan =
  | { kind: "retry"; patch: Record<string, unknown> }
  | { kind: "escalate" }

/**
 * @description 规划执行失败后的处置（重试或升级）
 * @param fields - 字段记录
 * @param now - 当前时间
 * @param maxRetries - 最大重试次数
 * @returns 失败处置计划
 */
export function planExecutionFailure(
  fields: Record<string, unknown>,
  now: Date,
  maxRetries = MAX_EXECUTION_RETRIES,
): ExecutionFailurePlan {
  const retryCount = parseRetryCount(fields)
  if (retryCount >= maxRetries) return { kind: "escalate" }
  return {
    kind: "retry",
    patch: {
      状态: "待处理",
      错误信息: "",
      最后处理时间: now.getTime(),
      [DISPATCH_FIELDS.retryCount]: retryCount + 1,
      [DISPATCH_FIELDS.nextRetryAt]: now.getTime() + RETRY_BACKOFF_MS[retryCount],
      ...buildLeaseReleasePatch(),
    },
  }
}

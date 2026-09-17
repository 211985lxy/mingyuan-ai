import { AsyncLocalStorage } from "node:async_hooks"

/** 服务端生成总预算：用户体感 120 秒，预留 5 秒返回错误与落 Trace。 */
export const AIM_EXECUTION_DEADLINE_MS = 115_000
export const AIM_DEADLINE_TAIL_MS = 5_000

export class AimDeadlineExceededError extends Error {
  readonly code = "GENERATION_DEADLINE"

  constructor(message = "本次生成超过等待上限") {
    super(message)
    this.name = "AimDeadlineExceededError"
  }
}

export class AimExecutionAbortedError extends Error {
  readonly code = "USER_ABORTED"

  constructor(message = "用户停止了本次生成") {
    super(message)
    this.name = "AimExecutionAbortedError"
  }
}

export interface AimExecutionDeadline {
  deadlineAt: number
  remainingMs(): number
  signal: AbortSignal
  /** 本层预算是否被自己的计时器耗尽：用于把「超时」与「上游中止」分开分类。 */
  expiredByTimer: boolean
}

const storage = new AsyncLocalStorage<AimExecutionDeadline>()

export function getAimExecutionDeadline(): AimExecutionDeadline | undefined {
  return storage.getStore()
}

function normalizeBudgetMs(timeoutMs: number): number {
  return Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : 0
}

/**
 * 中止原因分类：本层计时器耗尽算超时；否则沿用上游原因——父层计时器耗尽同样算超时，
 * 剩下的（客户端断开等）算用户中止。误判成用户中止会让降级链继续空转，所以父层的
 * 耗尽原因必须分辨，不能只看信号是否 aborted。
 */
function abortReason(
  parent: AimExecutionDeadline | undefined,
  timedOut: boolean,
  upstreamSignal: AbortSignal | undefined,
): Error {
  if (timedOut) return new AimDeadlineExceededError()
  if (parent) return parent.expiredByTimer ? new AimDeadlineExceededError() : new AimExecutionAbortedError()
  return upstreamSignal?.aborted ? new AimExecutionAbortedError() : new AimDeadlineExceededError()
}

/**
 * 建立一层执行预算并运行 fn；嵌套时取更严的那一层。
 *
 * 此前嵌套直接 `return fn()`，内层的 timeoutMs 被静默丢掉，于是：
 *   - 「给某个阶段加一层更严的上限」完全无效；
 *   - 反过来在外层套一个更宽的预算（入口层 115s 套住 runner 的 60s），会把内层更严的
 *     上限一起放大——2026-09-15 在 /api/aim/generate 上真的踩过一次。
 * 现在取 min(内层上限, 外层剩余)，两个方向都不会出意外。
 */
export async function runWithAimExecutionDeadline<T>(
  timeoutMs: number,
  fn: () => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const parent = storage.getStore()
  const upstreamSignal = parent?.signal ?? externalSignal
  const budgetMs = parent
    ? Math.min(normalizeBudgetMs(timeoutMs), parent.remainingMs())
    : normalizeBudgetMs(timeoutMs)

  const deadlineAt = Date.now() + budgetMs
  const controller = new AbortController()
  const store: AimExecutionDeadline & { controller: AbortController } = {
    deadlineAt,
    controller,
    signal: controller.signal,
    expiredByTimer: false,
    remainingMs() {
      return Math.max(0, deadlineAt - Date.now())
    },
  }

  return storage.run(store, async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let onUpstreamAbort: (() => void) | undefined
    let rejectForAbort: (() => void) | undefined
    const abortError = new Promise<never>((_, reject) => {
      rejectForAbort = () => reject(abortReason(parent, store.expiredByTimer, upstreamSignal))
      controller.signal.addEventListener("abort", rejectForAbort, { once: true })
      onUpstreamAbort = () => controller.abort()
      if (upstreamSignal?.aborted) onUpstreamAbort()
      else upstreamSignal?.addEventListener("abort", onUpstreamAbort, { once: true })
      timer = setTimeout(() => {
        store.expiredByTimer = true
        controller.abort()
      }, budgetMs)
    })
    try {
      return await Promise.race([fn(), abortError])
    } finally {
      if (timer) clearTimeout(timer)
      if (rejectForAbort) controller.signal.removeEventListener("abort", rejectForAbort)
      if (onUpstreamAbort) upstreamSignal?.removeEventListener("abort", onUpstreamAbort)
    }
  })
}

export function resolveProviderTimeoutMs(routeTimeoutMs: number): number {
  const route = Number.isFinite(routeTimeoutMs) ? Math.max(1, Math.floor(routeTimeoutMs)) : 1
  const deadline = getAimExecutionDeadline()
  if (!deadline) return route
  const remaining = deadline.remainingMs()
  if (remaining <= AIM_DEADLINE_TAIL_MS) {
    throw new AimDeadlineExceededError()
  }
  return Math.min(route, remaining - AIM_DEADLINE_TAIL_MS)
}

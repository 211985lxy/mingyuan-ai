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
}

const storage = new AsyncLocalStorage<AimExecutionDeadline>()

export function getAimExecutionDeadline(): AimExecutionDeadline | undefined {
  return storage.getStore()
}

function createStore(timeoutMs: number): AimExecutionDeadline & { controller: AbortController } {
  const budget = Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : 0
  const deadlineAt = Date.now() + budget
  const controller = new AbortController()
  return {
    deadlineAt,
    controller,
    signal: controller.signal,
    remainingMs() {
      return Math.max(0, deadlineAt - Date.now())
    },
  }
}

export async function runWithAimExecutionDeadline<T>(
  timeoutMs: number,
  fn: () => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const existing = storage.getStore()
  if (existing) return fn()
  const store = createStore(timeoutMs)
  return storage.run(store, async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let onExternalAbort: (() => void) | undefined
    let rejectForAbort: (() => void) | undefined
    const abortError = new Promise<never>((_, reject) => {
      rejectForAbort = () => {
        reject(externalSignal?.aborted
          ? new AimExecutionAbortedError()
          : new AimDeadlineExceededError())
      }
      store.controller.signal.addEventListener("abort", rejectForAbort, { once: true })
      onExternalAbort = () => store.controller.abort()
      if (externalSignal?.aborted) onExternalAbort()
      else externalSignal?.addEventListener("abort", onExternalAbort, { once: true })
      timer = setTimeout(() => store.controller.abort(), Math.max(0, Math.floor(timeoutMs)))
    })
    try {
      return await Promise.race([fn(), abortError])
    } finally {
      if (timer) clearTimeout(timer)
      if (rejectForAbort) store.controller.signal.removeEventListener("abort", rejectForAbort)
      if (onExternalAbort) externalSignal?.removeEventListener("abort", onExternalAbort)
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

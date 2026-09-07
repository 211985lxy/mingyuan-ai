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

export interface AimExecutionDeadline {
  deadlineAt: number
  remainingMs(): number
}

const storage = new AsyncLocalStorage<AimExecutionDeadline>()

export function getAimExecutionDeadline(): AimExecutionDeadline | undefined {
  return storage.getStore()
}

function createStore(timeoutMs: number): AimExecutionDeadline {
  const budget = Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : 0
  const deadlineAt = Date.now() + budget
  return {
    deadlineAt,
    remainingMs() {
      return Math.max(0, deadlineAt - Date.now())
    },
  }
}

export async function runWithAimExecutionDeadline<T>(
  timeoutMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = storage.getStore()
  if (existing) return fn()
  return storage.run(createStore(timeoutMs), fn)
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

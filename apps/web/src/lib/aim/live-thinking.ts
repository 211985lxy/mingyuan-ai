import { AsyncLocalStorage } from "node:async_hooks"
import { redis } from "@/lib/redis"

/** 与 aim-observability 的 trace 频道前缀保持一致，思考帧走同一条 Redis 通道。 */
export const AIM_TRACE_CHANNEL_PREFIX = "aim:trace:"
export const LIVE_THINKING_FLUSH_MS = 200
export const LIVE_THINKING_MAX_CHARS = 8_000

const storage = new AsyncLocalStorage<string>()

type BufferState = {
  text: string
  attempt: number
  reset: boolean
  timer?: ReturnType<typeof setTimeout>
}

const buffers = new Map<string, BufferState>()

/** 灰度开关：默认关。关闭时 provider 继续丢弃 reasoning_content。 */
export function isShowLiveThinkingEnabled(): boolean {
  return process.env.AIM_SHOW_LIVE_THINKING_ENABLED === "true"
}

export function getActiveAimTraceId(): string | undefined {
  return storage.getStore()
}

/** 路由 / 执行内核在创建 trace 之后包一层；拿不到 trace 时原样执行。 */
export function runWithActiveAimTrace<T>(traceId: string | undefined, fn: () => T): T {
  if (!traceId) return fn()
  return storage.run(traceId, fn)
}

export function resetLiveThinkingForTests(): void {
  for (const buf of buffers.values()) {
    if (buf.timer) clearTimeout(buf.timer)
  }
  buffers.clear()
}

function takeBuffer(traceId: string): BufferState {
  let buf = buffers.get(traceId)
  if (!buf) {
    buf = { text: "", attempt: 0, reset: false }
    buffers.set(traceId, buf)
  }
  return buf
}

function publishRaw(traceId: string, event: Record<string, unknown>): void {
  redis.publish(`${AIM_TRACE_CHANNEL_PREFIX}${traceId}`, JSON.stringify(event)).catch(() => {})
}

function flushNow(traceId: string, done = false): void {
  const buf = buffers.get(traceId)
  if (!buf) {
    if (done) publishRaw(traceId, { type: "reasoning", text: "", done: true })
    return
  }
  if (buf.timer) {
    clearTimeout(buf.timer)
    buf.timer = undefined
  }
  const text = buf.text
  const reset = buf.reset
  const attempt = buf.attempt
  buf.text = ""
  buf.reset = false
  if (!text && !reset && !done) return
  publishRaw(traceId, {
    type: "reasoning",
    text,
    ...(attempt > 0 ? { attempt } : {}),
    ...(reset ? { reset: true } : {}),
    ...(done ? { done: true } : {}),
  })
}

/** 换线路时调用：第二次起会带 reset，避免两家模型的思考糊在一起。 */
export function beginTraceReasoningAttempt(traceId?: string): number {
  const id = traceId ?? getActiveAimTraceId()
  if (!id) return 0
  const buf = takeBuffer(id)
  buf.attempt += 1
  if (buf.attempt > 1) {
    buf.reset = true
    buf.text = ""
    flushNow(id)
  }
  return buf.attempt
}

/** 只走 redis.publish，绝不写 AimExecutionTrace.steps。失败吞掉。 */
export function publishTraceReasoning(text: string, traceId?: string): void {
  const id = traceId ?? getActiveAimTraceId()
  if (!id || !text) return
  try {
    const buf = takeBuffer(id)
    const room = LIVE_THINKING_MAX_CHARS - buf.text.length
    if (room <= 0) return
    buf.text += text.slice(0, room)
    if (buf.timer) return
    buf.timer = setTimeout(() => {
      buf.timer = undefined
      flushNow(id)
    }, LIVE_THINKING_FLUSH_MS)
  } catch {
    /* fire-and-forget：与现有 publishTraceEvent 一致 */
  }
}

export function flushTraceReasoning(options?: { done?: boolean; traceId?: string }): void {
  const id = options?.traceId ?? getActiveAimTraceId()
  if (!id) return
  try {
    flushNow(id, options?.done === true)
    if (options?.done) buffers.delete(id)
  } catch {
    /* fire-and-forget */
  }
}

export function attachLiveThinking(traceId?: string) {
  if (!traceId || !isShowLiveThinkingEnabled()) {
    return { onReasoning() {}, onContentStart() {}, finish() {} }
  }
  beginTraceReasoningAttempt(traceId)
  let open = true
  return {
    onReasoning(text: string) {
      if (!open || !text) return
      publishTraceReasoning(text, traceId)
    },
    onContentStart() {
      if (!open) return
      open = false
      flushTraceReasoning({ done: true, traceId })
    },
    finish(done = false) {
      if (!open) return
      open = false
      flushTraceReasoning({ done, traceId })
    },
  }
}

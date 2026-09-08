"use client"

/** ThinkingProcessPanel 的 SSE 连接与有限重连逻辑。
 *  独立成模块治理组件文件体量（面板模块 ≤500 行）；TraceStep 在此定义并由面板 re-export。 */

export interface TraceStep {
  key: string
  label: string
  status: "running" | "success" | "failed" | "skipped"
  durationMs?: number
  summary?: string
  inputSummary?: string
  outputSummary?: string
  metadata?: Record<string, unknown>
  error?: string
}

export interface AimTraceStreamCallbacks {
  /** 当前活动 EventSource 的引用（组件用 ref 持有，卸载/收口时复位） */
  eventSourceRef: { current: EventSource | null }
  /** SSE onopen：连接建立（含重连成功） */
  onOpen: () => void
  /** 步骤 upsert：step / replay 服务端事件均携带 step */
  onStep: (step: TraceStep) => void
  /**
   * 终态收口回调：
   * - failed：是否标记为失败态（error / done(status=failed)）
   * - completed：仅 done 事件为 true（此时才触发组件的 onComplete）
   * 90s 守卫超时、服务端 timeout、重连耗尽均以 (false, false) 收口。
   */
  onTerminal: (failed: boolean, completed: boolean) => void
}

const SSE_TIMEOUT_MS = 90_000
const MAX_SSE_RETRIES = 2
const RETRY_DELAYS = [700, 1400]

/** 单次连接会话的运行态（生命周期内随连接/重连更新） */
type TraceStreamRuntime = {
  traceId: string
  callbacks: AimTraceStreamCallbacks
  cancelled: boolean
  /** 已收口（终态/守卫超时/卸载）后不再重连 */
  terminal: boolean
  es: EventSource | null
  hangTimer: number | undefined
  reconnectTimer: number | undefined
  retryCount: number
}

function clearSseHangTimer(rt: TraceStreamRuntime) {
  if (rt.hangTimer === undefined) return
  window.clearTimeout(rt.hangTimer)
  rt.hangTimer = undefined
}

/** 终态收口：清守卫计时/挂起重连、关闭当前连接并复位 ref */
function teardownSseStream(rt: TraceStreamRuntime) {
  rt.terminal = true
  clearSseHangTimer(rt)
  if (rt.reconnectTimer !== undefined) {
    window.clearTimeout(rt.reconnectTimer)
    rt.reconnectTimer = undefined
  }
  rt.es?.close()
  rt.es = null
  rt.callbacks.eventSourceRef.current = null
}

function dispatchAimTraceMessage(rt: TraceStreamRuntime, raw: string) {
  const data = JSON.parse(raw) as { type: string; status?: string; step?: TraceStep }
  if (data.type === "connected") return
  if (data.type === "step" || data.type === "replay") {
    if (data.step) rt.callbacks.onStep(data.step)
    return
  }
  // done / error / timeout 共用收口逻辑（到达即终态，此后不再重连）
  if (data.type === "done") {
    rt.callbacks.onTerminal(data.status === "failed", true)
  } else if (data.type === "error") {
    rt.callbacks.onTerminal(true, false)
  } else if (data.type === "timeout") {
    rt.callbacks.onTerminal(false, false)
  } else {
    return
  }
  teardownSseStream(rt)
}

/** onerror 收口：终态后不重连；重连耗尽按旧行为收口为完成态；否则退避重开 */
function handleSseConnectionError(rt: TraceStreamRuntime) {
  // 终态已收到 / 已卸载：沿用旧行为直接收口，不重连
  if (rt.cancelled || rt.terminal) return
  // 重连次数耗尽：与旧 onerror 行为一致（收口为完成态）
  if (rt.retryCount >= MAX_SSE_RETRIES) {
    rt.callbacks.onTerminal(false, false)
    teardownSseStream(rt)
    return
  }
  // 订阅先于服务端 trace 落库或网络闪断：关闭当前连接，退避后重开
  clearSseHangTimer(rt)
  rt.es?.close()
  rt.es = null
  rt.callbacks.eventSourceRef.current = null
  const delay = RETRY_DELAYS[rt.retryCount] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]
  rt.retryCount += 1
  rt.reconnectTimer = window.setTimeout(() => {
    rt.reconnectTimer = undefined
    openSseConnection(rt)
  }, delay)
}

/** 打开一次 EventSource 连接并挂载句柄；每次重连都会重新武装 90s 守卫计时 */
function openSseConnection(rt: TraceStreamRuntime) {
  if (rt.cancelled || rt.terminal) return
  rt.es = new EventSource(`/api/aim/trace/${encodeURIComponent(rt.traceId)}`, { withCredentials: true })
  rt.callbacks.eventSourceRef.current = rt.es

  // SSE 若迟迟收不到 done/error，前端强制收口，避免一直停在「正在思考…」
  rt.hangTimer = window.setTimeout(() => {
    if (rt.cancelled) return
    rt.callbacks.onTerminal(false, false)
    teardownSseStream(rt)
  }, SSE_TIMEOUT_MS)

  rt.es.onopen = () => {
    if (!rt.cancelled) rt.callbacks.onOpen()
  }

  rt.es.onmessage = (event) => {
    if (rt.cancelled) return
    try {
      dispatchAimTraceMessage(rt, event.data as string)
    } catch {
      // 忽略解析错误
    }
  }

  rt.es.onerror = () => {
    if (rt.cancelled) return
    handleSseConnectionError(rt)
  }
}

/**
 * 连接 AIM trace SSE。
 *
 * 订阅可能先于服务端 trace 落库——SSE 路由对未创建的 traceId 直接返回 404，EventSource
 * 会触发 onerror。此处做有限重连（~700ms / ~1400ms，最多 2 次）再按旧行为收口，避免
 * 面板在「订阅先于创建」的竞态下静默关闭。终态（done/error/timeout）与 90s 守卫超时后
 * 不再重连。
 *
 * 返回 dispose：组件卸载或 traceId 变化时调用，中止挂起的重连与守卫计时。
 */
export function connectAimTraceStream(traceId: string, callbacks: AimTraceStreamCallbacks): () => void {
  const rt: TraceStreamRuntime = {
    traceId,
    callbacks,
    cancelled: false,
    terminal: false,
    es: null,
    hangTimer: undefined,
    reconnectTimer: undefined,
    retryCount: 0,
  }
  openSseConnection(rt)
  return () => {
    rt.cancelled = true
    teardownSseStream(rt)
  }
}

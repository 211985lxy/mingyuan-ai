/**
 * connectAimTraceStream（SSE 有限重连状态机）直接测试。
 *
 * 用可控的 EventSource stub + fake timers 驱动：成功流、首连失败重连预算、
 * 终态后不重连、90s 守卫收口、dispose 中止。纯逻辑模块，无需渲染组件。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { connectAimTraceStream, type TraceStep } from "@/components/aim/aim-trace-sse"

class MockEventSource {
  static instances: MockEventSource[] = []
  url: string
  withCredentials: boolean | undefined
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string, options?: { withCredentials?: boolean }) {
    this.url = url
    this.withCredentials = options?.withCredentials
    MockEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  static current() {
    return MockEventSource.instances[MockEventSource.instances.length - 1]
  }
}

const RETRY_DELAYS = [700, 1400]

function baseCallbacks() {
  return {
    eventSourceRef: { current: null as EventSource | null },
    onOpen: vi.fn(),
    onStep: vi.fn(),
    onTerminal: vi.fn(),
  }
}

function makeStep(): TraceStep {
  return { key: "resolve_user_intent", label: "意图约束解析", status: "success" }
}

beforeEach(() => {
  vi.useFakeTimers()
  MockEventSource.instances = []
  vi.stubGlobal("EventSource", MockEventSource)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("connectAimTraceStream", () => {
  it("连接成功：URL 带 traceId 与凭据，onopen 后 step 与 done 依次回调并关闭", () => {
    const cbs = baseCallbacks()
    const dispose = connectAimTraceStream("trace-1", cbs)

    expect(MockEventSource.current().url).toBe("/api/aim/trace/trace-1")
    expect(MockEventSource.current().withCredentials).toBe(true)

    MockEventSource.current().onopen?.()
    expect(cbs.onOpen).toHaveBeenCalledTimes(1)

    MockEventSource.current().onmessage?.({ data: JSON.stringify({ type: "step", step: makeStep() }) })
    expect(cbs.onStep).toHaveBeenCalledWith(makeStep())

    MockEventSource.current().onmessage?.({ data: JSON.stringify({ type: "done", status: "success" }) })
    expect(cbs.onTerminal).toHaveBeenCalledWith(false, true)
    expect(MockEventSource.current().closed).toBe(true)

    dispose()
  })

  it("replay 事件按 step 处理，timeout 收口为完成态", () => {
    const cbs = baseCallbacks()
    const dispose = connectAimTraceStream("trace-2", cbs)

    MockEventSource.current().onmessage?.({ data: JSON.stringify({ type: "replay", step: makeStep() }) })
    expect(cbs.onStep).toHaveBeenCalledTimes(1)

    MockEventSource.current().onmessage?.({ data: JSON.stringify({ type: "timeout" }) })
    expect(cbs.onTerminal).toHaveBeenLastCalledWith(false, false)
    expect(MockEventSource.current().closed).toBe(true)

    dispose()
  })

  it("首连失败：按 700/1400ms 退避重连，第三次失败耗尽预算收口，不无限重连", () => {
    const cbs = baseCallbacks()
    const dispose = connectAimTraceStream("trace-3", cbs)

    // error #1 → 700ms 后重连
    MockEventSource.current().onerror?.()
    expect(MockEventSource.instances[0].closed).toBe(true)
    expect(MockEventSource.instances).toHaveLength(1)
    vi.advanceTimersByTime(RETRY_DELAYS[0])
    expect(MockEventSource.instances).toHaveLength(2)

    // error #2 → 1400ms 后重连
    MockEventSource.current().onerror?.()
    vi.advanceTimersByTime(RETRY_DELAYS[1])
    expect(MockEventSource.instances).toHaveLength(3)

    // error #3 → 预算耗尽，收口为完成态并关闭
    MockEventSource.current().onerror?.()
    expect(cbs.onTerminal).toHaveBeenCalledWith(false, false)
    expect(MockEventSource.current().closed).toBe(true)
    expect(cbs.eventSourceRef.current).toBeNull()

    dispose()
  })

  it("收到终态后不再重连（error 消息或后续 onerror 均不触发新连接）", () => {
    const cbs = baseCallbacks()
    const dispose = connectAimTraceStream("trace-4", cbs)
    const first = MockEventSource.current()

    // 服务端 error 事件 → 终态收口
    first.onmessage?.({ data: JSON.stringify({ type: "error" }) })
    expect(cbs.onTerminal).toHaveBeenCalledWith(true, false)
    expect(first.closed).toBe(true)

    // 收口后即使旧句柄再收到 onerror（网络层竞态）也不重连
    first.onerror?.()
    vi.advanceTimersByTime(RETRY_DELAYS[1] + 100)
    expect(MockEventSource.instances).toHaveLength(1)

    dispose()
  })

  it("90s 守卫：无任何服务端事件时自动收口为完成态，之后不重连", () => {
    const cbs = baseCallbacks()
    const dispose = connectAimTraceStream("trace-5", cbs)
    const first = MockEventSource.current()

    vi.advanceTimersByTime(90_000)
    expect(cbs.onTerminal).toHaveBeenCalledWith(false, false)
    expect(first.closed).toBe(true)

    // 守卫收口后旧句柄的 onerror 不应触发重连
    first.onerror?.()
    vi.advanceTimersByTime(5_000)
    expect(MockEventSource.instances).toHaveLength(1)

    dispose()
  })

  it("dispose 中止挂起的重连：退避期间卸载不再建立新连接", () => {
    const cbs = baseCallbacks()
    const dispose = connectAimTraceStream("trace-6", cbs)

    MockEventSource.current().onerror?.() // 进入 700ms 退避
    dispose()
    vi.advanceTimersByTime(RETRY_DELAYS[0] + RETRY_DELAYS[1] + 100)

    expect(MockEventSource.instances).toHaveLength(1)
    expect(cbs.onTerminal).not.toHaveBeenCalled()
  })
})

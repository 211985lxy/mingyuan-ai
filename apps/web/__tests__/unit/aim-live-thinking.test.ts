import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { publish, prismaUpdate, prismaFindUnique } = vi.hoisted(() => ({
  publish: vi.fn().mockResolvedValue(1),
  prismaUpdate: vi.fn(),
  prismaFindUnique: vi.fn(),
}))

vi.mock("@/lib/redis", () => ({
  redis: { publish },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: {
      update: prismaUpdate,
      findUnique: prismaFindUnique,
    },
  },
}))

import {
  attachLiveThinking,
  beginTraceReasoningAttempt,
  flushTraceReasoning,
  getActiveAimTraceId,
  isShowLiveThinkingEnabled,
  LIVE_THINKING_FLUSH_MS,
  publishTraceReasoning,
  resetLiveThinkingForTests,
  runWithActiveAimTrace,
} from "@/lib/aim/live-thinking"

describe("live thinking side channel", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    publish.mockClear()
    prismaUpdate.mockClear()
    prismaFindUnique.mockClear()
    resetLiveThinkingForTests()
    process.env.AIM_SHOW_LIVE_THINKING_ENABLED = "false"
  })

  afterEach(() => {
    resetLiveThinkingForTests()
    vi.useRealTimers()
    delete process.env.AIM_SHOW_LIVE_THINKING_ENABLED
  })

  it("is off unless the flag is the string true", () => {
    expect(isShowLiveThinkingEnabled()).toBe(false)
    process.env.AIM_SHOW_LIVE_THINKING_ENABLED = "TRUE"
    expect(isShowLiveThinkingEnabled()).toBe(false)
    process.env.AIM_SHOW_LIVE_THINKING_ENABLED = "true"
    expect(isShowLiveThinkingEnabled()).toBe(true)
  })

  it("exposes the active trace only inside the ALS scope", () => {
    expect(getActiveAimTraceId()).toBeUndefined()
    const inner = runWithActiveAimTrace("trace-a", () => getActiveAimTraceId())
    expect(inner).toBe("trace-a")
    expect(getActiveAimTraceId()).toBeUndefined()
    expect(runWithActiveAimTrace(undefined, () => getActiveAimTraceId())).toBeUndefined()
  })

  it("does not publish without an active trace", () => {
    publishTraceReasoning("思考")
    vi.advanceTimersByTime(LIVE_THINKING_FLUSH_MS)
    expect(publish).not.toHaveBeenCalled()
  })

  it("throttles redis publishes and never touches the trace table", () => {
    runWithActiveAimTrace("trace-1", () => {
      publishTraceReasoning("甲")
      publishTraceReasoning("乙")
      expect(publish).not.toHaveBeenCalled()
      vi.advanceTimersByTime(LIVE_THINKING_FLUSH_MS)
    })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0]).toBe("aim:trace:trace-1")
    expect(JSON.parse(publish.mock.calls[0][1] as string)).toEqual({
      type: "reasoning",
      text: "甲乙",
    })
    expect(prismaUpdate).not.toHaveBeenCalled()
    expect(prismaFindUnique).not.toHaveBeenCalled()
  })

  it("flushes leftover tokens at end without writing steps", () => {
    runWithActiveAimTrace("trace-2", () => {
      publishTraceReasoning("尾包")
      flushTraceReasoning({ done: true })
    })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(JSON.parse(publish.mock.calls[0][1] as string)).toMatchObject({
      type: "reasoning",
      text: "尾包",
      done: true,
    })
    expect(prismaUpdate).not.toHaveBeenCalled()
  })

  it("marks a reset on the second attempt", () => {
    runWithActiveAimTrace("trace-3", () => {
      expect(beginTraceReasoningAttempt()).toBe(1)
      expect(beginTraceReasoningAttempt()).toBe(2)
    })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(JSON.parse(publish.mock.calls[0][1] as string)).toMatchObject({
      type: "reasoning",
      reset: true,
      attempt: 2,
    })
  })

  it("attachLiveThinking is a no-op when the flag is off", () => {
    const hooks = attachLiveThinking("trace-4")
    hooks.onReasoning("不该发出去")
    hooks.onContentStart()
    hooks.finish(true)
    vi.advanceTimersByTime(LIVE_THINKING_FLUSH_MS)
    expect(publish).not.toHaveBeenCalled()
  })

  it("attachLiveThinking forwards then marks done when content starts", () => {
    process.env.AIM_SHOW_LIVE_THINKING_ENABLED = "true"
    const hooks = attachLiveThinking("trace-5")
    hooks.onReasoning("先想")
    hooks.onContentStart()
    expect(JSON.parse(publish.mock.calls.at(-1)?.[1] as string)).toMatchObject({
      type: "reasoning",
      text: "先想",
      done: true,
      attempt: 1,
    })
    hooks.onReasoning("正文后不再发")
    vi.advanceTimersByTime(LIVE_THINKING_FLUSH_MS)
    expect(publish).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it } from "vitest"

import { applyReasoningEvent, EMPTY_LIVE_REASONING } from "@/components/aim/thinking-live-reasoning-state"

describe("applyReasoningEvent", () => {
  it("appends text and marks done without mixing a reset", () => {
    const first = applyReasoningEvent(EMPTY_LIVE_REASONING, { text: "甲", attempt: 1 })
    const done = applyReasoningEvent(first, { text: "乙", done: true, attempt: 1 })
    expect(done.text).toBe("甲乙")
    expect(done.streaming).toBe(false)
    expect(done.done).toBe(true)
    expect(done.attempt).toBe(1)
  })

  it("reset replaces prior model thinking and bumps the attempt", () => {
    const first = applyReasoningEvent(EMPTY_LIVE_REASONING, { text: "模型A", attempt: 1 })
    const reset = applyReasoningEvent(first, { reset: true, attempt: 2, text: "模型B" })
    expect(reset.text).toBe("模型B")
    expect(reset.attempt).toBe(2)
    expect(reset.streaming).toBe(true)
  })
})

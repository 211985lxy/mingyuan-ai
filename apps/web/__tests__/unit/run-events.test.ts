import { afterEach, describe, expect, it, vi } from "vitest"

const { recordAimRunEvent } = vi.hoisted(() => ({
  recordAimRunEvent: vi.fn(),
}))

vi.mock("@/lib/api/client", () => ({ recordAimRunEvent }))

import {
  reportFinalDisposition,
  reportRequiredAimRunEvent,
} from "@/lib/aim/run-events"

const outcome = {
  workflowId: "content-growth-v1",
  taskType: "write_script",
  finalDisposition: "accepted_first_pass" as const,
  humanActiveMinutes: 5,
  channel: "web" as const,
  requestId: "req-stable",
}

describe("required run telemetry", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it("retries once with the same requestId", async () => {
    vi.useFakeTimers()
    recordAimRunEvent
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined)
    const reporting = reportFinalDisposition("run_1", outcome)
    await vi.runAllTimersAsync()
    await reporting
    expect(recordAimRunEvent).toHaveBeenCalledTimes(2)
    expect(recordAimRunEvent.mock.calls[0]?.[2]).toEqual(
      recordAimRunEvent.mock.calls[1]?.[2],
    )
    expect(recordAimRunEvent.mock.calls[1]?.[2]).toMatchObject({
      requestId: "req-stable",
    })
  })

  it("surfaces failure after the safe retry", async () => {
    vi.useFakeTimers()
    recordAimRunEvent.mockRejectedValue(new Error("offline"))
    const reporting = reportRequiredAimRunEvent("run_1", "edited", {
      requestId: "req-edit-stable",
    })
    const rejection = expect(reporting).rejects.toThrow("offline")
    await vi.runAllTimersAsync()
    await rejection
    expect(recordAimRunEvent).toHaveBeenCalledTimes(2)
    expect(recordAimRunEvent.mock.calls[0]?.[2]).toEqual(
      recordAimRunEvent.mock.calls[1]?.[2],
    )
  })
})

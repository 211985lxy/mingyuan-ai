import { describe, expect, it } from "vitest"
import { BACKGROUND_TASK_STATUS, planBackgroundTaskFailure } from "@/lib/background-tasks"

describe("background task retry plan", () => {
  const now = new Date("2026-07-19T00:00:00.000Z")

  it("schedules retryable failures with bounded backoff", () => {
    expect(planBackgroundTaskFailure({ attempt: 1, maxAttempts: 3, retryable: true, now })).toEqual({
      status: BACKGROUND_TASK_STATUS.retryWait,
      availableAt: new Date("2026-07-19T00:01:00.000Z"),
    })
  })

  it("stops non-retryable and exhausted failures", () => {
    expect(planBackgroundTaskFailure({ attempt: 1, maxAttempts: 3, retryable: false, now }).status).toBe(BACKGROUND_TASK_STATUS.failed)
    expect(planBackgroundTaskFailure({ attempt: 3, maxAttempts: 3, retryable: true, now }).status).toBe(BACKGROUND_TASK_STATUS.failed)
  })
})

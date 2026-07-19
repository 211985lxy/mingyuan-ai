import { beforeEach, describe, expect, it, vi } from "vitest"

const { runtimeEnv } = vi.hoisted(() => ({
  runtimeEnv: { NODE_ENV: "test", BACKGROUND_TASKS_ENABLED: undefined as string | undefined },
}))

vi.mock("@/env", () => ({ env: runtimeEnv }))

import { areBackgroundTasksEnabled } from "@/lib/background-task-runtime"

describe("background task runtime availability", () => {
  beforeEach(() => {
    runtimeEnv.NODE_ENV = "test"
    runtimeEnv.BACKGROUND_TASKS_ENABLED = undefined
  })

  it("keeps local and test execution available without a deployment flag", () => {
    expect(areBackgroundTasksEnabled()).toBe(true)
  })

  it("fails closed in production until an explicit scheduler flag exists", () => {
    runtimeEnv.NODE_ENV = "production"
    expect(areBackgroundTasksEnabled()).toBe(false)

    runtimeEnv.BACKGROUND_TASKS_ENABLED = "true"
    expect(areBackgroundTasksEnabled()).toBe(true)
  })
})

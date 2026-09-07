import { describe, expect, it } from "vitest"

import {
  AimDeadlineExceededError,
  getAimExecutionDeadline,
  resolveProviderTimeoutMs,
  runWithAimExecutionDeadline,
} from "@/lib/llm/execution-deadline"

describe("AIM execution deadline", () => {
  it("shares one deadline across nested work and never resets the full budget", async () => {
    await runWithAimExecutionDeadline(80, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      const inner = getAimExecutionDeadline()
      expect(inner).toBeDefined()
      expect(inner!.remainingMs()).toBeLessThanOrEqual(55)
      await runWithAimExecutionDeadline(80, async () => {
        expect(getAimExecutionDeadline()!.remainingMs()).toBeLessThanOrEqual(55)
      })
    })
  })

  it("uses min(route timeout, remaining - 5s tail) and throws when the tail is gone", async () => {
    await runWithAimExecutionDeadline(20_000, async () => {
      expect(resolveProviderTimeoutMs(50_000)).toBeLessThanOrEqual(15_000)
    })
    await expect(runWithAimExecutionDeadline(1, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      resolveProviderTimeoutMs(20_000)
    })).rejects.toBeInstanceOf(AimDeadlineExceededError)
  })
})

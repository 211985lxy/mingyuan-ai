import { describe, expect, it } from "vitest"

import {
  AIM_EXECUTION_DEADLINE_MS,
  AimDeadlineExceededError,
  AimExecutionAbortedError,
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

  it("aborts the whole execution when the shared deadline expires", async () => {
    await expect(runWithAimExecutionDeadline(10, () => new Promise(() => undefined))).rejects.toBeInstanceOf(AimDeadlineExceededError)
  })

  it("actually applies a nested budget that is tighter than the outer one", async () => {
    const started = Date.now()
    await expect(
      runWithAimExecutionDeadline(1_000, () =>
        runWithAimExecutionDeadline(30, () => new Promise(() => undefined)),
      ),
    ).rejects.toBeInstanceOf(AimDeadlineExceededError)
    // 此前嵌套的内层 timeoutMs 被静默丢掉，只能等外层 1 秒才收手。
    expect(Date.now() - started).toBeLessThan(500)
  })

  it("never lets a nested budget widen the outer one", async () => {
    // 回归守卫：入口层 115s 套住 runner 的 60s 时，生效的必须是 60s。
    // 之前那种"再包一层就以为更安全"的写法会把内层更严的上限放大。
    await runWithAimExecutionDeadline(AIM_EXECUTION_DEADLINE_MS, async () => {
      await runWithAimExecutionDeadline(60_000, async () => {
        expect(getAimExecutionDeadline()!.remainingMs()).toBeLessThanOrEqual(60_000)
      })
    })
  })

  it("keeps a client abort classified as a user abort inside a nested scope", async () => {
    const external = new AbortController()
    const pending = runWithAimExecutionDeadline(5_000, () =>
      runWithAimExecutionDeadline(5_000, () => new Promise(() => undefined)),
      external.signal,
    )
    setTimeout(() => external.abort(), 20)

    // 客户端断开必须仍然是「用户中止」，不能被算成超时（超时会触发换线路重试）。
    await expect(pending).rejects.toBeInstanceOf(AimExecutionAbortedError)
  })
})

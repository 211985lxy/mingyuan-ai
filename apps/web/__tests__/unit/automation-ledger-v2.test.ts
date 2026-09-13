import { describe, expect, it } from "vitest"
import { isJobEnabledByEnv, isJobEnabledByOverlay, jobEnabledSettingKey, parseDisabledJobIds } from "@/lib/aim/automation-job-flags"
import { mutexKey, mutexSlot } from "@/lib/aim/automation-job-flags"
import { AUTOMATION_JOB_CATALOG } from "@/lib/aim/automation-ledger-catalog"

describe("台账开关与互斥", () => {
  it("env 名单能关掉指定任务，默认全开", () => {
    expect(isJobEnabledByEnv("topic-daily", undefined)).toBe(true)
    expect(isJobEnabledByEnv("topic-daily", "cleanup,topic-daily")).toBe(false)
    expect(parseDisabledJobIds(" a, b ").has("a")).toBe(true)
  })

  it("库里的覆盖优先于 env", () => {
    const overlay = new Map([[jobEnabledSettingKey("cleanup"), "false"]])
    expect(isJobEnabledByOverlay("cleanup", overlay, "")).toBe(false)
    expect(isJobEnabledByOverlay("topic-daily", overlay, "topic-daily")).toBe(false)
    overlay.set(jobEnabledSettingKey("topic-daily"), "true")
    expect(isJobEnabledByOverlay("topic-daily", overlay, "topic-daily")).toBe(true)
  })

  it("立即执行互斥键按五分钟窗口切", () => {
    const a = new Date("2026-09-12T12:00:00.000Z")
    const b = new Date("2026-09-12T12:04:59.000Z")
    const c = new Date("2026-09-12T12:05:00.000Z")
    expect(mutexSlot(a)).toBe(mutexSlot(b))
    expect(mutexSlot(a)).not.toBe(mutexSlot(c))
    expect(mutexKey("topic-daily", a)).toContain("topic-daily")
  })

  it("每个任务都挂了现成 cron 路径", () => {
    expect(AUTOMATION_JOB_CATALOG.every((job) => job.cronPath.startsWith("/api/cron/"))).toBe(true)
  })
})

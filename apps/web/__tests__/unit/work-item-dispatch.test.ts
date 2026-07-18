import { describe, expect, it } from "vitest"
import {
  DISPATCH_FIELDS,
  MAX_EXECUTION_RETRIES,
  RETRY_BACKOFF_MS,
  buildIdempotencyKey,
  buildLeaseAcquirePatch,
  buildLeaseReleasePatch,
  isLeaseActive,
  isRetryDue,
  parseRetryCount,
  planExecutionFailure,
} from "@/lib/aim/work-item-dispatch"

// WP-8 无人值守执行（90 天计划 6.1）纯域层：
// 幂等键、执行租约、指数退避重试、连续失败升级人工接管。

const NOW = new Date("2026-07-18T09:00:00.000Z")

describe("buildIdempotencyKey", () => {
  it("由记录 ID + 操作类型生成", () => {
    expect(buildIdempotencyKey("rec_1", "meeting_insight")).toBe("rec_1:meeting_insight")
  })
})

describe("isLeaseActive", () => {
  it("租约截止时间在未来 → 活跃", () => {
    const fields = { [DISPATCH_FIELDS.leaseUntil]: NOW.getTime() + 60_000 }
    expect(isLeaseActive(fields, NOW)).toBe(true)
  })
  it("租约已过期或缺失 → 不活跃", () => {
    expect(isLeaseActive({ [DISPATCH_FIELDS.leaseUntil]: NOW.getTime() - 1 }, NOW)).toBe(false)
    expect(isLeaseActive({}, NOW)).toBe(false)
    expect(isLeaseActive({ [DISPATCH_FIELDS.leaseUntil]: "垃圾" }, NOW)).toBe(false)
  })
})

describe("租约 patch", () => {
  it("获取租约写入截止时间与持有者", () => {
    const patch = buildLeaseAcquirePatch("cron-host-1", NOW, 600_000)
    expect(patch[DISPATCH_FIELDS.leaseUntil]).toBe(NOW.getTime() + 600_000)
    expect(patch[DISPATCH_FIELDS.leaseHolder]).toBe("cron-host-1")
  })
  it("释放租约清空截止时间与持有者", () => {
    const patch = buildLeaseReleasePatch()
    expect(patch[DISPATCH_FIELDS.leaseUntil]).toBeNull()
    expect(patch[DISPATCH_FIELDS.leaseHolder]).toBe("")
  })
})

describe("parseRetryCount / isRetryDue", () => {
  it("重试次数缺失或为垃圾值时按 0 处理", () => {
    expect(parseRetryCount({})).toBe(0)
    expect(parseRetryCount({ [DISPATCH_FIELDS.retryCount]: "x" })).toBe(0)
    expect(parseRetryCount({ [DISPATCH_FIELDS.retryCount]: 2 })).toBe(2)
  })
  it("下次重试时间缺失或已到期 → 可执行；未到期 → 跳过", () => {
    expect(isRetryDue({}, NOW)).toBe(true)
    expect(isRetryDue({ [DISPATCH_FIELDS.nextRetryAt]: NOW.getTime() - 1000 }, NOW)).toBe(true)
    expect(isRetryDue({ [DISPATCH_FIELDS.nextRetryAt]: NOW.getTime() + 60_000 }, NOW)).toBe(false)
  })
})

describe("planExecutionFailure", () => {
  it("前 3 次失败安排指数退避重试，重试次数递增", () => {
    for (let attempt = 0; attempt < MAX_EXECUTION_RETRIES; attempt += 1) {
      const plan = planExecutionFailure(
        { [DISPATCH_FIELDS.retryCount]: attempt },
        NOW,
      )
      expect(plan.kind).toBe("retry")
      if (plan.kind !== "retry") return
      expect(plan.patch[DISPATCH_FIELDS.retryCount]).toBe(attempt + 1)
      expect(plan.patch[DISPATCH_FIELDS.nextRetryAt]).toBe(NOW.getTime() + RETRY_BACKOFF_MS[attempt])
      // 重试必须退回待处理并释放租约
      expect(plan.patch["状态"]).toBe("待处理")
      expect(plan.patch[DISPATCH_FIELDS.leaseUntil]).toBeNull()
    }
  })
  it("退避间隔指数增长（1 / 5 / 15 分钟）", () => {
    expect(RETRY_BACKOFF_MS).toEqual([60_000, 300_000, 900_000])
    expect(MAX_EXECUTION_RETRIES).toBe(3)
  })
  it("第 4 次失败（重试次数已达上限）→ 升级人工接管", () => {
    const plan = planExecutionFailure(
      { [DISPATCH_FIELDS.retryCount]: MAX_EXECUTION_RETRIES },
      NOW,
    )
    expect(plan.kind).toBe("escalate")
  })
})

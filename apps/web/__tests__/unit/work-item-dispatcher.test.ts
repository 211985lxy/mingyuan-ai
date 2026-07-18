import { beforeEach, describe, expect, it, vi } from "vitest"
import { dispatchPendingWorkItems, type WorkItemDispatcherPorts } from "@/lib/aim/services/work-item-dispatcher"
import { DISPATCH_FIELDS, RETRY_BACKOFF_MS } from "@/lib/aim/work-item-dispatch"
import type { WorkItemRecord } from "@/lib/aim/services/work-item-execution"

// WP-8 无人值守执行调度（90 天计划 6.1）：
// 扫描待处理 → 租约互斥 → 幂等执行 → 超时重试（指数退避）→ 连续失败升级人工接管并通知。
// 自动化只能推进内部状态，不能自动对客户发送、报价、发布或删除。

const NOW = new Date("2026-07-18T09:00:00.000Z")

function makeRecord(recordId: string, fields: Record<string, unknown> = {}): WorkItemRecord {
  return { recordId, fields: { 状态: "待处理", ...fields } }
}

function makePorts(records: WorkItemRecord[]) {
  const updates: Array<{ recordId: string; fields: Record<string, unknown> }> = []
  const notifications: string[] = []
  const execute = vi.fn(
    async (_recordId: string, _key: string): Promise<{ ok: true } | { ok: false; error: string }> =>
      ({ ok: true }),
  )
  const ports: WorkItemDispatcherPorts = {
    store: {
      async get(recordId) {
        return records.find((r) => r.recordId === recordId) ?? null
      },
      async update(recordId, fields) {
        updates.push({ recordId, fields })
        const record = records.find((r) => r.recordId === recordId)
        if (record) record.fields = { ...record.fields, ...fields }
        return { ok: true as const }
      },
    },
    listPending: async (limit) => records.slice(0, limit),
    execute,
    notify: async (message) => {
      notifications.push(message)
    },
    now: () => NOW,
    holderId: "cron-host-1",
  }
  return { ports, updates, notifications, execute }
}

describe("dispatchPendingWorkItems", () => {
  let records: WorkItemRecord[]
  beforeEach(() => {
    records = [makeRecord("rec_1")]
  })

  it("成功路径：获取租约 → 执行 → 释放租约，幂等键为 记录ID:操作类型", async () => {
    const { ports, updates, execute } = makePorts(records)
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary).toMatchObject({ scanned: 1, started: 1, succeeded: 1, failed: 0 })
    expect(execute).toHaveBeenCalledWith("rec_1", "rec_1:meeting_insight")
    // 最后一次写入应释放租约
    const last = updates[updates.length - 1]
    expect(last.fields[DISPATCH_FIELDS.leaseUntil]).toBeNull()
  })

  it("租约活跃的记录被跳过（两台进程不会同时处理）", async () => {
    records = [makeRecord("rec_1", { [DISPATCH_FIELDS.leaseUntil]: NOW.getTime() + 60_000 })]
    const { ports, execute } = makePorts(records)
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.skippedLeased).toBe(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it("下次重试时间未到期的记录被跳过", async () => {
    records = [makeRecord("rec_1", { [DISPATCH_FIELDS.nextRetryAt]: NOW.getTime() + 60_000 })]
    const { ports, execute } = makePorts(records)
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.skippedNotDue).toBe(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it("非待处理状态的记录不进入自动执行", async () => {
    records = [makeRecord("rec_1", { 状态: "待人工审核" })]
    const { ports, execute } = makePorts(records)
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.skippedNotPending).toBe(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it("首次执行失败：退回待处理、重试次数=1、按第一档退避、释放租约", async () => {
    const { ports, updates, execute } = makePorts(records)
    execute.mockResolvedValueOnce({ ok: false, error: "模型超时" })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.failed).toBe(1)
    expect(summary.escalated).toBe(0)
    const retryPatch = updates.find((u) => u.fields[DISPATCH_FIELDS.retryCount] === 1)
    expect(retryPatch).toBeTruthy()
    expect(retryPatch!.fields[DISPATCH_FIELDS.nextRetryAt]).toBe(NOW.getTime() + RETRY_BACKOFF_MS[0])
    expect(retryPatch!.fields["状态"]).toBe("待处理")
    expect(retryPatch!.fields[DISPATCH_FIELDS.leaseUntil]).toBeNull()
  })

  it("重试次数达上限仍失败：进入失败态并标记需人工接管，通知负责人", async () => {
    records = [makeRecord("rec_1", { [DISPATCH_FIELDS.retryCount]: 3 })]
    const { ports, updates, notifications, execute } = makePorts(records)
    execute.mockResolvedValueOnce({ ok: false, error: "第三次还是失败" })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.escalated).toBe(1)
    const escalatePatch = updates.find((u) => u.fields[DISPATCH_FIELDS.needsHuman] === true)
    expect(escalatePatch).toBeTruthy()
    expect(updates.some((u) => u.fields["状态"] === "失败")).toBe(true)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toContain("rec_1")
    expect(notifications[0]).toContain("第三次还是失败")
  })

  it("执行超时按失败处理（错误包含超时信息）", async () => {
    const { ports, updates, execute } = makePorts(records)
    execute.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true as const }), 60_000)),
    )
    const summary = await dispatchPendingWorkItems({ ...ports, executionTimeoutMs: 50 })
    expect(summary.failed).toBe(1)
    expect(summary.errors[0]?.error).toContain("超时")
    expect(updates.some((u) => u.fields[DISPATCH_FIELDS.retryCount] === 1)).toBe(true)
  })

  it("通知失败不拖垮调度，记录在 errors 中", async () => {
    records = [makeRecord("rec_1", { [DISPATCH_FIELDS.retryCount]: 3 })]
    const { ports, execute } = makePorts(records)
    execute.mockResolvedValueOnce({ ok: false, error: "失败" })
    ports.notify = async () => {
      throw new Error("飞书通知接口异常")
    }
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.escalated).toBe(1)
    expect(summary.errors.some((e) => e.error.includes("通知"))).toBe(true)
  })

  it("记录读取失败计入 errors，不中断后续记录", async () => {
    records = [makeRecord("rec_1"), makeRecord("rec_2")]
    const { ports, execute } = makePorts(records)
    const originalGet = ports.store.get.bind(ports.store)
    ports.store.get = async (recordId) => {
      if (recordId === "rec_1") throw new Error("飞书读取异常")
      return originalGet(recordId)
    }
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.errors.some((e) => e.recordId === "rec_1")).toBe(true)
    expect(execute).toHaveBeenCalledWith("rec_2", "rec_2:meeting_insight")
    expect(summary.succeeded).toBe(1)
  })
})

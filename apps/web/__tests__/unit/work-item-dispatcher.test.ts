import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  dispatchPendingWorkItems,
  buildDispatchRunId,
  type DispatchExecuteOutcome,
  type WorkItemDispatcherPorts,
} from "@/lib/aim/services/work-item-dispatcher"
import { DISPATCH_FIELDS, RETRY_BACKOFF_MS } from "@/lib/aim/work-item-dispatch"
import type { WorkItemRecord } from "@/lib/aim/services/work-item-execution"
import { retryWorkItem } from "@/lib/aim/services/work-item-execution"
import { getRegisteredLoop } from "@/lib/aim/loops/registry"
import type { SupervisorNotification } from "@/lib/aim/feishu-supervisor-notifier"

// WP-8 无人值守执行调度（90 天计划 6.1）：
// 扫描待处理 → 租约互斥 → 幂等执行 → 超时重试（指数退避）→ 连续失败升级人工接管并通知。
// 自动化只能推进内部状态，不能自动对客户发送、报价、发布或删除。

const NOW = new Date("2026-07-18T09:00:00.000Z")

function makeRecord(recordId: string, fields: Record<string, unknown> = {}): WorkItemRecord {
  return { recordId, fields: { 状态: "待处理", LoopID: "sales-diagnosis-v1", Loop版本: 1, ...fields } }
}

function makePorts(records: WorkItemRecord[]) {
  const updates: Array<{ recordId: string; fields: Record<string, unknown> }> = []
  const notifications: SupervisorNotification[] = []
  const execute = vi.fn(
    async (recordId: string, context): Promise<DispatchExecuteOutcome> => {
      void recordId
      void context
      return { ok: true }
    },
  )
  const claim = vi.fn<WorkItemDispatcherPorts["claim"]>(async (_recordId, context) => ({
    acquired: true,
    token: { id: context.runId, startedAt: NOW.getTime() },
  }))
  const failClaim = vi.fn<WorkItemDispatcherPorts["failClaim"]>(async () => undefined)
  const releaseClaim = vi.fn<WorkItemDispatcherPorts["releaseClaim"]>(async () => undefined)
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
    claim,
    failClaim,
    releaseClaim,
    notify: async (notification) => {
      notifications.push(notification)
    },
    now: () => NOW,
    holderId: "cron-host-1",
    resolveLoop: (id) => {
      const loop = getRegisteredLoop(id)
      return {
        ...loop,
        supervisionPolicy: {
          ...loop.supervisionPolicy,
          budget: { ...loop.supervisionPolicy.budget, maxRunsPerWorkItem: 4, maxAutoRetries: 3 },
        },
      }
    },
  }
  return { ports, updates, notifications, execute, claim, failClaim, releaseClaim }
}

describe("dispatchPendingWorkItems", () => {
  let records: WorkItemRecord[]
  beforeEach(() => {
    records = [makeRecord("rec_1")]
  })

  it("成功路径：获取租约 → 执行 → 释放租约，幂等键为 记录ID:操作类型", async () => {
    const { ports, updates, execute, notifications } = makePorts(records)
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary).toMatchObject({ scanned: 1, started: 1, succeeded: 1, failed: 0 })
    expect(execute).toHaveBeenCalledWith("rec_1", expect.objectContaining({
      idempotencyKey: "rec_1:sales-diagnosis-v1",
      loop: expect.objectContaining({ id: "sales-diagnosis-v1", version: 1 }),
    }))
    // 最后一次写入应释放租约
    const last = updates[updates.length - 1]
    expect(last.fields[DISPATCH_FIELDS.leaseUntil]).toBeNull()
    expect(last.fields[DISPATCH_FIELDS.stopReason]).toBe("")
    expect(last.fields[DISPATCH_FIELDS.nextAction]).toBe("等待人工审核")
    expect(notifications).toEqual([expect.objectContaining({ type: "review_required", recordId: "rec_1" })])
  })

  it("验证存在信息缺口时发送需人工判断通知，不把它当执行失败", async () => {
    const { ports, execute, notifications } = makePorts(records)
    execute.mockResolvedValueOnce({
      ok: true,
      verificationStatus: "needs_human",
      resultLink: "https://example.com/result",
    })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.succeeded).toBe(1)
    expect(summary.failed).toBe(0)
    expect(notifications).toEqual([expect.objectContaining({
      type: "human_judgment",
      resultLink: "https://example.com/result",
    })])
  })

  it("审核通知失败只记录错误，不回滚已成功的经营事项", async () => {
    const { ports } = makePorts(records)
    ports.notify = async () => { throw new Error("飞书消息权限不足") }
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.succeeded).toBe(1)
    expect(summary.errors.some((item) => item.error.includes("通知负责人失败"))).toBe(true)
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
    execute.mockResolvedValueOnce({ ok: false, error: "模型超时", retryable: true, stopReason: "execution_timeout" })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.failed).toBe(1)
    expect(summary.escalated).toBe(0)
    const retryPatch = updates.find((u) => u.fields[DISPATCH_FIELDS.retryCount] === 1)
    expect(retryPatch).toBeTruthy()
    expect(retryPatch!.fields[DISPATCH_FIELDS.nextRetryAt]).toBe(NOW.getTime() + RETRY_BACKOFF_MS[0])
    expect(updates.some((update) => update.fields["状态"] === "失败")).toBe(true)
    expect(updates.some((update) => update.fields["状态"] === "待处理")).toBe(true)
    expect(retryPatch!.fields[DISPATCH_FIELDS.leaseUntil]).toBeNull()
  })

  it("不可重试失败立即人工接管，不退回待处理", async () => {
    const { ports, updates, notifications, execute } = makePorts(records)
    execute.mockResolvedValueOnce({
      ok: false,
      error: "销售诊断已消耗唯一运行次数",
      retryable: false,
      stopReason: "human_required",
    })

    const summary = await dispatchPendingWorkItems(ports)

    expect(summary).toMatchObject({ failed: 0, escalated: 1 })
    expect(updates.some((u) => u.fields[DISPATCH_FIELDS.retryCount] === 1)).toBe(false)
    expect(updates.some((u) => u.fields["状态"] === "待处理")).toBe(false)
    expect(notifications).toHaveLength(1)
  })

  it("重试次数达上限仍失败：进入失败态并标记需人工接管，通知负责人", async () => {
    records = [makeRecord("rec_1", { [DISPATCH_FIELDS.retryCount]: 3 })]
    const { ports, updates, notifications, execute } = makePorts(records)
    execute.mockResolvedValueOnce({ ok: false, error: "第三次还是失败", retryable: true, stopReason: "execution_timeout" })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.escalated).toBe(1)
    const escalatePatch = updates.find((u) => u.fields[DISPATCH_FIELDS.needsHuman] === true)
    expect(escalatePatch).toBeTruthy()
    expect(updates.some((u) => u.fields["状态"] === "失败")).toBe(true)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      recordId: "rec_1",
      type: "execution_timeout",
      summary: "自动重试预算已耗尽，请人工接管。",
    })
  })

  it("已经由 Provider 中止的超时结果按失败处理", async () => {
    const { ports, updates, execute } = makePorts(records)
    execute.mockResolvedValueOnce({
      ok: false,
      error: "Provider 请求超时并已中止",
      retryable: true,
      stopReason: "execution_timeout",
    })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.failed).toBe(1)
    expect(summary.errors[0]?.error).toContain("超时")
    expect(updates.some((u) => u.fields[DISPATCH_FIELDS.retryCount] === 1)).toBe(true)
  })

  it("人工修正并重置到待处理后生成新的持久化运行 ID，可再次领取", async () => {
    const { ports, execute } = makePorts(records)
    ports.resolveLoop = getRegisteredLoop
    execute.mockResolvedValueOnce({
      ok: false,
      error: "确定性验证失败",
      retryable: false,
      stopReason: "verification_failed",
    })
    await dispatchPendingWorkItems(ports)
    const firstRunId = records[0].fields[DISPATCH_FIELDS.lastRunId]
    expect(typeof firstRunId).toBe("string")

    const retried = await retryWorkItem(ports.store, "rec_1")
    expect(retried.ok).toBe(true)
    execute.mockResolvedValueOnce({ ok: true })
    await dispatchPendingWorkItems(ports)
    const secondRunId = records[0].fields[DISPATCH_FIELDS.lastRunId]
    expect(secondRunId).not.toBe(firstRunId)
    expect(execute.mock.calls[1]?.[1].runId).toBe(secondRunId)
  })

  it("同一上次运行 ID 导出同一 claim，新一轮形成哈希链", () => {
    const loop = getRegisteredLoop("sales-diagnosis-v1")
    const first = buildDispatchRunId("rec_1", loop, "")
    expect(buildDispatchRunId("rec_1", loop, "")).toBe(first)
    expect(buildDispatchRunId("rec_1", loop, first)).not.toBe(first)
  })

  it("执行器抛出未知异常时不盲目重试，直接人工接管", async () => {
    const { ports, execute, updates } = makePorts(records)
    execute.mockRejectedValueOnce(new Error("未分类配置异常"))
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.escalated).toBe(1)
    expect(updates.some((update) => update.fields[DISPATCH_FIELDS.retryCount] === 1)).toBe(false)
  })

  it("原子 Trace 重复领取被视为已抑制，不执行、不改状态、不释放他人租约", async () => {
    const { ports, execute, updates, claim } = makePorts(records)
    claim.mockResolvedValueOnce({ acquired: false })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.duplicatesSuppressed).toBe(1)
    expect(summary.failed).toBe(0)
    expect(summary.escalated).toBe(0)
    expect(execute).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
    expect(updates.some((update) => update.fields[DISPATCH_FIELDS.leaseUntil] === null)).toBe(false)
    expect(updates.some((update) => update.fields["状态"] === "待处理")).toBe(false)
  })

  it("两个 Cron 同时读到待处理时仅一个可写入，最终待人工审核不被倒退", async () => {
    const sharedRecord = makeRecord("rec_race")
    records = [sharedRecord]
    const first = makePorts(records)
    const second = makePorts(records)
    const allUpdates: Array<Record<string, unknown>> = []
    const sharedStore = {
      async get(recordId: string) {
        return recordId === sharedRecord.recordId ? sharedRecord : null
      },
      async update(recordId: string, fields: Record<string, unknown>) {
        expect(recordId).toBe(sharedRecord.recordId)
        allUpdates.push(fields)
        sharedRecord.fields = { ...sharedRecord.fields, ...fields }
        return { ok: true as const }
      },
    }
    first.ports.store = sharedStore
    second.ports.store = sharedStore

    let arrivals = 0
    let releaseBarrier!: () => void
    const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve })
    const claimedRunIds = new Set<string>()
    const atomicClaim = vi.fn(async (_recordId: string, context) => {
      arrivals += 1
      if (arrivals === 2) releaseBarrier()
      await barrier
      if (claimedRunIds.has(context.runId)) return { acquired: false as const }
      claimedRunIds.add(context.runId)
      return { acquired: true as const, token: { id: context.runId } }
    })
    first.ports.claim = atomicClaim
    second.ports.claim = atomicClaim

    const finishInReview = async () => {
      await sharedStore.update(sharedRecord.recordId, { 状态: "待人工审核", AIM结果ID: "gen_race" })
      return { ok: true as const }
    }
    first.ports.execute = vi.fn(finishInReview)
    second.ports.execute = vi.fn(finishInReview)

    const [firstSummary, secondSummary] = await Promise.all([
      dispatchPendingWorkItems(first.ports),
      dispatchPendingWorkItems(second.ports),
    ])

    expect(firstSummary.started + secondSummary.started).toBe(1)
    expect(firstSummary.duplicatesSuppressed + secondSummary.duplicatesSuppressed).toBe(1)
    expect(first.ports.execute).toHaveBeenCalledTimes(firstSummary.started)
    expect(second.ports.execute).toHaveBeenCalledTimes(secondSummary.started)
    expect(first.notifications.length + second.notifications.length).toBe(1)
    expect(allUpdates.filter((fields) => fields["状态"] === "处理中")).toHaveLength(1)
    expect(sharedRecord.fields["状态"]).toBe("待人工审核")
  })

  it("最后运行ID写入失败会释放 pre-start claim，下一轮可重新领取", async () => {
    const { ports, execute, claim, releaseClaim } = makePorts(records)
    const activeClaims = new Set<string>()
    claim.mockImplementation(async (_recordId, context) => {
      if (activeClaims.has(context.runId)) return { acquired: false as const }
      activeClaims.add(context.runId)
      return { acquired: true as const, token: { id: context.runId } }
    })
    releaseClaim.mockImplementation(async (token: unknown) => {
      activeClaims.delete((token as { id: string }).id)
    })
    const originalUpdate = ports.store.update.bind(ports.store)
    let failLastRunWrite = true
    ports.store.update = async (recordId, fields) => {
      if (failLastRunWrite && DISPATCH_FIELDS.lastRunId in fields) {
        failLastRunWrite = false
        throw new Error("飞书 lastRun 写入失败")
      }
      return originalUpdate(recordId, fields)
    }

    const first = await dispatchPendingWorkItems(ports)
    expect(first.started).toBe(0)
    expect(execute).not.toHaveBeenCalled()
    expect(releaseClaim).toHaveBeenCalledTimes(1)
    expect(records[0].fields["状态"]).toBe("待处理")

    const second = await dispatchPendingWorkItems(ports)
    expect(second.succeeded).toBe(1)
    expect(claim).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("租约写入失败会释放 Trace 并把处理中事项升级为人工接管", async () => {
    const { ports, execute, releaseClaim, failClaim } = makePorts(records)
    const originalUpdate = ports.store.update.bind(ports.store)
    ports.store.update = async (recordId, fields) => {
      if (DISPATCH_FIELDS.leaseHolder in fields && fields[DISPATCH_FIELDS.leaseHolder]) {
        throw new Error("飞书租约写入失败")
      }
      return originalUpdate(recordId, fields)
    }

    const summary = await dispatchPendingWorkItems(ports)

    expect(execute).not.toHaveBeenCalled()
    expect(releaseClaim).toHaveBeenCalledTimes(1)
    expect(failClaim).not.toHaveBeenCalled()
    expect(summary.escalated).toBe(1)
    expect(records[0].fields["状态"]).toBe("失败")
    expect(records[0].fields[DISPATCH_FIELDS.needsHuman]).toBe(true)
  })

  it("Loop 预算禁止自动重试时，临时错误也立即转人工", async () => {
    const { ports, execute, updates } = makePorts(records)
    ports.resolveLoop = getRegisteredLoop
    execute.mockResolvedValueOnce({ ok: false, error: "上游 503", retryable: true, stopReason: "human_required" })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.escalated).toBe(1)
    expect(updates.some((update) => update.fields[DISPATCH_FIELDS.retryCount] === 1)).toBe(false)
    expect(updates.some((update) => update.fields[DISPATCH_FIELDS.stopReason] === "retry_exhausted")).toBe(true)
  })

  it("通知失败不拖垮调度，记录在 errors 中", async () => {
    records = [makeRecord("rec_1", { [DISPATCH_FIELDS.retryCount]: 3 })]
    const { ports, execute } = makePorts(records)
    execute.mockResolvedValueOnce({ ok: false, error: "失败", retryable: false, stopReason: "human_required" })
    ports.notify = async () => {
      throw new Error("飞书通知接口异常")
    }
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.escalated).toBe(1)
    expect(summary.errors.some((e) => e.error.includes("通知"))).toBe(true)
  })

  it("失败状态回写失败时不伪报已人工接管", async () => {
    const { ports, execute } = makePorts(records)
    const originalUpdate = ports.store.update.bind(ports.store)
    ports.store.update = async (recordId, fields) => {
      if (fields["状态"] === "失败") throw new Error("飞书状态写入失败")
      return originalUpdate(recordId, fields)
    }
    execute.mockResolvedValueOnce({ ok: false, error: "验证失败", retryable: false, stopReason: "verification_failed" })
    const summary = await dispatchPendingWorkItems(ports)
    expect(summary.escalated).toBe(0)
    expect(summary.errors.some((item) => item.error.includes("失败状态回写失败"))).toBe(true)
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
    expect(execute).toHaveBeenCalledWith("rec_2", expect.objectContaining({
      idempotencyKey: "rec_2:sales-diagnosis-v1",
    }))
    expect(summary.succeeded).toBe(1)
  })

  it.each([
    ["缺 LoopID", { LoopID: "" }],
    ["未知 LoopID", { LoopID: "unknown-loop-v1" }],
    ["版本不匹配", { Loop版本: 2 }],
  ])("%s 时不执行模型并立即人工接管", async (_label, fields) => {
    records = [makeRecord("rec_1", fields)]
    const { ports, execute, updates } = makePorts(records)
    const summary = await dispatchPendingWorkItems(ports)
    expect(execute).not.toHaveBeenCalled()
    expect(summary.escalated).toBe(1)
    expect(updates.some((update) => update.fields[DISPATCH_FIELDS.stopReason] === "missing_input")).toBe(true)
  })

  it("重试失败写回停止原因和下一步动作", async () => {
    const { ports, execute, updates } = makePorts(records)
    execute.mockResolvedValueOnce({ ok: false, error: "上游 503", retryable: true, stopReason: "execution_timeout" })
    await dispatchPendingWorkItems(ports)
    expect(updates.some((update) =>
      update.fields[DISPATCH_FIELDS.stopReason] === "execution_timeout"
        && update.fields[DISPATCH_FIELDS.nextAction] === "等待自动重试",
    )).toBe(true)
  })
})

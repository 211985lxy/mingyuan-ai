import { describe, expect, it } from "vitest"
import { AUTOMATION_JOB_CATALOG } from "@/lib/aim/automation-ledger-catalog"
import {
  assembleAutomationLedger,
  type AutomationLedgerStore,
  type LedgerAlertRecord,
  type LedgerBackgroundTaskRecord,
  type LedgerReconcileCheckpointRecord,
} from "@/lib/aim/automation-ledger"

function store(input: {
  alerts?: LedgerAlertRecord[]
  tasks?: LedgerBackgroundTaskRecord[]
  checkpoints?: LedgerReconcileCheckpointRecord[]
}): AutomationLedgerStore {
  return {
    listRecentAlerts: async () => input.alerts ?? [],
    listRecentBackgroundTasks: async () => input.tasks ?? [],
    listReconcileCheckpoints: async () => input.checkpoints ?? [],
  }
}

const NOW = new Date("2026-09-12T12:00:00.000Z")

describe("自动化台账拼装", () => {
  it("目录用业务名，不把 cron 路径当标题", async () => {
    const ledger = await assembleAutomationLedger(store({}), NOW)
    expect(ledger.jobs.length).toBe(AUTOMATION_JOB_CATALOG.length)
    expect(ledger.jobs.map((job) => job.name)).toContain("每日选题推送")
    expect(ledger.jobs.every((job) => !job.name.startsWith("/api/cron"))).toBe(true)
    expect(ledger.jobs.every((job) => job.purpose.length > 8)).toBe(true)
    expect(ledger.jobs.every((job) => job.enabled)).toBe(true)
  })

  it("没有执行证据时不编造上次成功时间", async () => {
    const ledger = await assembleAutomationLedger(store({}), NOW)
    const probe = ledger.jobs.find((job) => job.id === "integration-probe")
    expect(probe?.lastRunAt).toBeNull()
    expect(probe?.lastRunEvidence).toBe("none")
    expect(probe?.health).toBe("ok")
    expect(probe?.lastRunNote).toContain("不把空白当成跑成功")
  })

  it("对应来源的错误告警把任务标成出问题", async () => {
    const ledger = await assembleAutomationLedger(store({
      alerts: [{
        source: "integration-probe",
        severity: "error",
        status: "open",
        summary: "抖音开放平台凭证失效",
        lastSeenAt: new Date("2026-09-12T11:00:00.000Z"),
      }],
    }), NOW)
    const probe = ledger.jobs.find((job) => job.id === "integration-probe")
    expect(probe?.health).toBe("down")
    expect(probe?.openAlertCount).toBe(1)
    expect(probe?.latestAlert?.summary).toContain("抖音")
    expect(ledger.summary.down).toBe(1)
  })

  it("警告告警标成需留意，已解决告警不计入", async () => {
    const ledger = await assembleAutomationLedger(store({
      alerts: [
        {
          source: "aihot-briefing",
          severity: "warning",
          status: "open",
          summary: "热点源部分失败",
          lastSeenAt: new Date("2026-09-12T10:00:00.000Z"),
        },
        {
          source: "aihot-briefing",
          severity: "error",
          status: "resolved",
          summary: "旧故障",
          lastSeenAt: new Date("2026-09-11T10:00:00.000Z"),
        },
      ],
    }), NOW)
    const job = ledger.jobs.find((item) => item.id === "aihot-briefing")
    expect(job?.health).toBe("attention")
    expect(job?.openAlertCount).toBe(1)
  })

  it("后台补做队列用任务表最近记录当上次执行", async () => {
    const ledger = await assembleAutomationLedger(store({
      tasks: [{
        kind: "inspiration_pipeline",
        status: "succeeded",
        completedAt: new Date("2026-09-12T11:50:00.000Z"),
        updatedAt: new Date("2026-09-12T11:50:00.000Z"),
        lastError: null,
      }],
    }), NOW)
    const job = ledger.jobs.find((item) => item.id === "background-tasks")
    expect(job?.lastRunAt).toBe("2026-09-12T11:50:00.000Z")
    expect(job?.lastRunEvidence).toBe("background_task")
    expect(job?.health).toBe("ok")
  })

  it("审计对账用检查点成功时间，24 小时内失败任务让队列进入需留意", async () => {
    const ledger = await assembleAutomationLedger(store({
      checkpoints: [{ source: "feishu", lastSuccessAt: new Date("2026-09-12T11:40:00.000Z") }],
      tasks: [{
        kind: "inspiration_pipeline",
        status: "failed",
        completedAt: null,
        updatedAt: new Date("2026-09-12T11:55:00.000Z"),
        lastError: "上游超时",
      }],
    }), NOW)
    expect(ledger.jobs.find((job) => job.id === "audit-reconcile")?.lastRunAt).toBe("2026-09-12T11:40:00.000Z")
    expect(ledger.jobs.find((job) => job.id === "background-tasks")?.health).toBe("attention")
  })
})

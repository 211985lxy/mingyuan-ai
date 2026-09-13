import { describe, expect, it } from "vitest"

import {
  AUTOMATION_TASK_SPECS,
  buildAutomationLedger,
  buildBackgroundKindLedger,
  buildScheduledTaskLedger,
  backgroundKindLabel,
} from "@/lib/aim/automation-ledger"

const NOW = "2026-09-12T08:00:00.000Z"

function alert(overrides: Partial<Parameters<typeof buildScheduledTaskLedger>[1][number]> = {}) {
  return {
    source: "integration-probe",
    severity: "warning",
    status: "open",
    summary: "探针降级",
    lastSeenAt: "2026-09-12T07:00:00.000Z",
    ...overrides,
  }
}

describe("buildScheduledTaskLedger", () => {
  it("无告警时全部健康，并带 Owner 与停用条件", () => {
    const rows = buildScheduledTaskLedger(AUTOMATION_TASK_SPECS, [])
    expect(rows).toHaveLength(AUTOMATION_TASK_SPECS.length)
    for (const row of rows) {
      expect(row.status).toBe("healthy")
      expect(row.ownerNote).toBeTruthy()
      expect(row.disableCondition).toBeTruthy()
    }
  })

  it("error 告警判 failing，warning 判 degraded，resolved 不计", () => {
    const specs = AUTOMATION_TASK_SPECS.filter((spec) => spec.id === "integration-probe")
    const rows = buildScheduledTaskLedger(
      specs,
      [
        alert({ severity: "error", status: "resolved", summary: "已解决的不算" }),
        alert({ severity: "warning", summary: "降级警告" }),
      ],
    )
    expect(rows[0]?.status).toBe("degraded")
    expect(rows[0]?.openWarningCount).toBe(1)
    expect(rows[0]?.openErrorCount).toBe(0)
    expect(rows[0]?.latestAlertSummary).toBe("降级警告")

    const failing = buildScheduledTaskLedger(
      specs,
      [alert({ severity: "critical", summary: "探针失败" })],
    )
    expect(failing[0]?.status).toBe("failing")
    expect(failing[0]?.openErrorCount).toBe(1)
  })

  it("source 前缀匹配到对应任务，不串扰其他任务", () => {
    const specs = AUTOMATION_TASK_SPECS.filter((spec) =>
      ["integration-probe", "topic-daily"].includes(spec.id),
    )
    const rows = buildScheduledTaskLedger(specs, [alert({ source: "integration-probe:feishu" })])
    const probe = rows.find((row) => row.id === "integration-probe")
    const topic = rows.find((row) => row.id === "topic-daily")
    expect(probe?.status).toBe("degraded")
    expect(topic?.status).toBe("healthy")
  })

  it("最新告警按 lastSeenAt 取最大", () => {
    const specs = AUTOMATION_TASK_SPECS.filter((spec) => spec.id === "integration-probe")
    const rows = buildScheduledTaskLedger(
      specs,
      [
        alert({ severity: "warning", lastSeenAt: "2026-09-10T00:00:00.000Z", summary: "旧的" }),
        alert({ severity: "warning", lastSeenAt: "2026-09-12T06:00:00.000Z", summary: "新的" }),
      ],
    )
    expect(rows[0]?.latestAlertSummary).toBe("新的")
  })
})

describe("buildBackgroundKindLedger", () => {
  it("失败优先置顶，其次降级/空闲，健康最后", () => {
    const rows = buildBackgroundKindLedger(
      [
        { kind: "a_healthy", queued: 0, failedRecent: 0, completedRecent: 5, lastCompletedAt: NOW },
        { kind: "b_failing", queued: 0, failedRecent: 2, completedRecent: 1, lastCompletedAt: NOW },
        { kind: "c_degraded", queued: 30, failedRecent: 0, completedRecent: 1, lastCompletedAt: NOW },
        { kind: "d_idle", queued: 0, failedRecent: 0, completedRecent: 0, lastCompletedAt: null },
      ],
    )
    expect(rows.map((row) => row.kind)).toEqual(["b_failing", "c_degraded", "d_idle", "a_healthy"])
    expect(rows.map((row) => row.status)).toEqual(["failing", "degraded", "idle", "healthy"])
  })
})

describe("buildAutomationLedger", () => {
  it("汇总统计覆盖两个分区", () => {
    const ledger = buildAutomationLedger(
      AUTOMATION_TASK_SPECS,
      [alert({ source: "topic", severity: "error" })],
      [
        { kind: "inspiration_process", queued: 0, failedRecent: 0, completedRecent: 3, lastCompletedAt: NOW },
        { kind: "topic_regenerate", queued: 25, failedRecent: 0, completedRecent: 0, lastCompletedAt: null },
      ],
      NOW,
    )
    expect(ledger.summary.failing).toBe(1) // topic-daily（error 告警）
    expect(ledger.summary.degraded).toBe(1) // topic_regenerate 排队 25
    expect(ledger.summary.healthy).toBe(AUTOMATION_TASK_SPECS.length - 1 + 1) // 其余定时任务 + inspiration_process
    expect(ledger.scheduled.length + ledger.background.length).toBe(
      ledger.summary.healthy + ledger.summary.degraded + ledger.summary.failing + ledger.summary.idle,
    )
  })
})

describe("backgroundKindLabel", () => {
  it("已知 kind 给可读名，未知原样返回", () => {
    expect(backgroundKindLabel("inspiration_process")).toBe("灵感处理")
    expect(backgroundKindLabel("unknown_kind")).toBe("unknown_kind")
  })
})

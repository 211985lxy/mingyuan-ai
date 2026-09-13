import {
  AUTOMATION_JOB_CATALOG,
  type AutomationJobCatalogEntry,
  type AutomationJobId,
} from "@/lib/aim/automation-ledger-catalog"

export type AutomationHealth = "ok" | "attention" | "down"
export type LastRunEvidence = "background_task" | "reconcile_checkpoint" | "none"

export interface LedgerAlertRecord {
  source: string
  severity: "warning" | "error" | "critical"
  status: "open" | "acknowledged" | "resolved"
  summary: string
  lastSeenAt: Date
}

export interface LedgerBackgroundTaskRecord {
  kind: string
  status: string
  completedAt: Date | null
  updatedAt: Date
  lastError: string | null
}

export interface LedgerReconcileCheckpointRecord {
  source: string
  lastSuccessAt: Date | null
}

export interface AutomationLedgerStore {
  listRecentBackgroundTasks(): Promise<LedgerBackgroundTaskRecord[]>
  listRecentAlerts(): Promise<LedgerAlertRecord[]>
  listReconcileCheckpoints(): Promise<LedgerReconcileCheckpointRecord[]>
}

export interface AutomationLedgerJob {
  id: AutomationJobId
  name: string
  purpose: string
  owner: string
  schedule: string
  disableCondition: string
  health: AutomationHealth
  healthLabel: string
  lastRunAt: string | null
  lastRunEvidence: LastRunEvidence
  lastRunNote: string
  openAlertCount: number
  latestAlert: { severity: string; summary: string; lastSeenAt: string } | null
  enabled: boolean
}

export interface AutomationLedger {
  generatedAt: string
  summary: { ok: number; attention: number; down: number }
  jobs: AutomationLedgerJob[]
}

const HEALTH_LABEL: Record<AutomationHealth, string> = {
  ok: "暂无告警",
  attention: "需留意",
  down: "出问题",
}

const OPEN_ALERT_STATUSES = new Set(["open", "acknowledged"])

function matchingAlerts(job: AutomationJobCatalogEntry, alerts: LedgerAlertRecord[]): LedgerAlertRecord[] {
  return alerts.filter((alert) => job.alertSources.includes(alert.source) && OPEN_ALERT_STATUSES.has(alert.status))
}

function healthFromAlerts(alerts: LedgerAlertRecord[]): AutomationHealth {
  if (alerts.some((alert) => alert.severity === "error" || alert.severity === "critical")) return "down"
  if (alerts.length > 0) return "attention"
  return "ok"
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function assembleJob(
  job: AutomationJobCatalogEntry,
  alerts: LedgerAlertRecord[],
  tasks: LedgerBackgroundTaskRecord[],
  checkpoints: LedgerReconcileCheckpointRecord[],
  now: Date,
  enabled: boolean,
): AutomationLedgerJob {
  const relatedAlerts = matchingAlerts(job, alerts)
  let health = healthFromAlerts(relatedAlerts)
  let lastRunAt: Date | null = null
  let lastRunEvidence: LastRunEvidence = "none"

  if (job.id === "background-tasks" && tasks.length > 0) {
    const latest = [...tasks].sort((a, b) => {
      const aTime = (a.completedAt ?? a.updatedAt).getTime()
      const bTime = (b.completedAt ?? b.updatedAt).getTime()
      return bTime - aTime
    })[0]
    lastRunAt = latest.completedAt ?? latest.updatedAt
    lastRunEvidence = "background_task"
    const dayAgo = now.getTime() - 24 * 60 * 60 * 1000
    const recentFailed = tasks.some((task) => task.status === "failed" && task.updatedAt.getTime() >= dayAgo)
    if (recentFailed && health === "ok") health = "attention"
  }

  if (job.id === "audit-reconcile") {
    const successTimes = checkpoints.map((row) => row.lastSuccessAt).filter((value): value is Date => Boolean(value))
    if (successTimes.length > 0) {
      lastRunAt = successTimes.reduce((latest, current) => (current > latest ? current : latest))
      lastRunEvidence = "reconcile_checkpoint"
    }
  }

  const latestAlert = relatedAlerts[0]
  const lastRunNote = lastRunEvidence === "none"
    ? "调度器没有回写成功执行时间，目前只能看告警，不把空白当成跑成功。"
    : lastRunEvidence === "background_task"
      ? "来自后台任务表最近一条记录。"
      : "来自审计对账检查点的最近成功时间。"

  return {
    id: job.id,
    name: job.name,
    purpose: job.purpose,
    owner: job.owner,
    schedule: job.schedule,
    disableCondition: job.disableCondition,
    health,
    healthLabel: HEALTH_LABEL[health],
    lastRunAt: iso(lastRunAt),
    lastRunEvidence,
    lastRunNote,
    openAlertCount: relatedAlerts.length,
    latestAlert: latestAlert
      ? {
          severity: latestAlert.severity,
          summary: latestAlert.summary,
          lastSeenAt: latestAlert.lastSeenAt.toISOString(),
        }
      : null,
    enabled,
  }
}

export async function assembleAutomationLedger(
  store: AutomationLedgerStore,
  now = new Date(),
  enabledByJob: Partial<Record<AutomationJobId, boolean>> = {},
): Promise<AutomationLedger> {
  const [tasks, alerts, checkpoints] = await Promise.all([
    store.listRecentBackgroundTasks(),
    store.listRecentAlerts(),
    store.listReconcileCheckpoints(),
  ])
  const sortedAlerts = [...alerts].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
  const jobs = AUTOMATION_JOB_CATALOG.map((job) =>
    assembleJob(job, sortedAlerts, tasks, checkpoints, now, enabledByJob[job.id] !== false),
  )
  return {
    generatedAt: now.toISOString(),
    summary: {
      ok: jobs.filter((job) => job.health === "ok").length,
      attention: jobs.filter((job) => job.health === "attention").length,
      down: jobs.filter((job) => job.health === "down").length,
    },
    jobs,
  }
}

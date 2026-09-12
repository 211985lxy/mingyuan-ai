/**
 * 自动化台账（WP-A2 V1，只读）。
 *
 * 把散在 systemd timer / vercel cron 里的定时能力拼装成用户可见台账：
 * 静态注册表（人写的职责/Owner/停用条件）+ 运行信号（未关闭告警、后台任务执行记录）
 * → 每个任务的健康态。不新建调度器，不提供启停（V2 再做可操作）。
 *
 * 诚实边界：定时 cron 的"上次执行"没有持久化运行记录（进程内跑完即丢），
 * V1 只对有持久化记录的耐久后台任务展示 lastRun；cron 行如实标注"无运行记录，V2 接入"。
 */

export type AutomationTaskStatus = "healthy" | "degraded" | "failing" | "idle"

export interface AutomationTaskSpec {
  id: string
  name: string
  endpoint: string
  cadence: string
  description: string
  ownerNote: string
  disableCondition: string
  /** 匹配 OperationalAlert.source 前缀；命中未关闭告警则降级 */
  alertSources: string[]
}

export interface LedgerAlertInput {
  source: string
  severity: string
  status: string
  summary: string
  lastSeenAt: string
}

export interface LedgerKindStatsInput {
  kind: string
  queued: number
  failedRecent: number
  completedRecent: number
  lastCompletedAt: string | null
}

export interface AutomationTaskRow {
  id: string
  name: string
  endpoint: string
  cadence: string
  description: string
  ownerNote: string
  disableCondition: string
  status: AutomationTaskStatus
  openErrorCount: number
  openWarningCount: number
  latestAlertSummary: string | null
  latestAlertAt: string | null
}

export interface BackgroundKindRow {
  kind: string
  status: AutomationTaskStatus
  queued: number
  failedRecent: number
  completedRecent: number
  lastCompletedAt: string | null
}

export interface AutomationLedger {
  generatedAt: string
  scheduled: AutomationTaskRow[]
  background: BackgroundKindRow[]
  summary: { healthy: number; degraded: number; failing: number; idle: number }
}

/** 定时能力注册表：与 vercel.json + ops/systemd 对齐；改动调度时同步改这里。 */
export const AUTOMATION_TASK_SPECS: AutomationTaskSpec[] = [
  {
    id: "douyin-hot",
    name: "抖音热点抓取",
    endpoint: "/api/cron/douyin-hot",
    cadence: "每小时",
    description: "拉取抖音热榜快照，供选题雷达与选题判断使用。",
    ownerNote: "选题链路 Owner；失败不影响主流程，仅热点参考滞后。",
    disableCondition: "热榜上游连续 7 天不可用且无替代源时评估下线。",
    alertSources: ["douyin-hot", "hot-topic"],
  },
  {
    id: "market-hotlist",
    name: "市场热榜刷新",
    endpoint: "/api/cron/market-hotlist",
    cadence: "每日",
    description: "生成 8 源市场热点快照，合并进入选题雷达筛选。",
    ownerNote: "选题链路 Owner。",
    disableCondition: "上游热榜源大面积失效时收缩到可用源。",
    alertSources: ["market-hotlist", "market-insights"],
  },
  {
    id: "aihot-briefing",
    name: "选题雷达简报",
    endpoint: "/api/cron/aihot-briefing",
    cadence: "每日 01:00",
    description: "聚合热点生成 AI 简报并推送飞书。",
    ownerNote: "选题链路 Owner；飞书通道依赖 integration-probe 的 feishu 探针。",
    disableCondition: "连续 2 周无人阅读简报时评估降频。",
    alertSources: ["aihot", "feishu"],
  },
  {
    id: "topic-daily",
    name: "每日选题生成",
    endpoint: "/api/cron/topic-daily",
    cadence: "每日 09:00",
    description: "生成选题并推裁决卡，人工裁决后进入生产。",
    ownerNote: "选题链路 Owner。",
    disableCondition: "裁决采用率连续 30 天为 0 时评估暂停推送。",
    alertSources: ["topic"],
  },
  {
    id: "outcome-flywheel",
    name: "效果飞轮评估",
    endpoint: "/api/cron/outcome-flywheel",
    cadence: "每日 04:00",
    description: "评估内容效果生成资产候选，并提醒到期未回填的窗口。",
    ownerNote: "经营归因链路 Owner。",
    disableCondition: "回填提醒连续 4 周零响应时评估降频。",
    alertSources: ["outcome"],
  },
  {
    id: "integration-probe",
    name: "外部集成探针",
    endpoint: "/api/cron/integration-probe",
    cadence: "每 6 小时",
    description: "对 OSS/TikHub/LLM/ASR/TTS 等外部契约做只读探活，异常落告警。",
    ownerNote: "运维 Owner；critical 失败自动发飞书。",
    disableCondition: "不适用（常设门禁）。",
    alertSources: ["integration-probe"],
  },
  {
    id: "operational-alerts",
    name: "运维告警 digest",
    endpoint: "/api/cron/operational-alerts",
    cadence: "定时",
    description: "按 fingerprint 去重汇总未处理告警，critical 推送飞书。",
    ownerNote: "运维 Owner。",
    disableCondition: "不适用（常设门禁）。",
    alertSources: ["operational-alerts"],
  },
  {
    id: "cleanup",
    name: "过期数据清理",
    endpoint: "/api/cron/cleanup",
    cadence: "每日 03:00",
    description: "清理过期热点与快照数据，控制存储增长。",
    ownerNote: "基础设施 Owner。",
    disableCondition: "不适用（常设任务）。",
    alertSources: ["cleanup"],
  },
  {
    id: "audit-reconcile",
    name: "审计对账",
    endpoint: "/api/cron/audit-reconcile",
    cadence: "定时",
    description: "核对审计断点（audit-reconcile-checkpoint），发现静默失败。",
    ownerNote: "治理 Owner。",
    disableCondition: "不适用（治理常设）。",
    alertSources: ["audit-reconcile"],
  },
  {
    id: "channel-metrics-rollup",
    name: "渠道工程指标日汇总",
    endpoint: "/api/cron/channel-metrics-rollup",
    cadence: "每日",
    description: "把 Redis 计数器日汇总落库（灵感管道工程指标，非经营指标）。",
    ownerNote: "基础设施 Owner。",
    disableCondition: "不适用（常设任务）。",
    alertSources: ["channel-metrics"],
  },
  {
    id: "control-center-retention",
    name: "控制中心数据保留期清理",
    endpoint: "/api/cron/control-center-retention",
    cadence: "定时",
    description: "按保留期清理控制中心过期数据。",
    ownerNote: "基础设施 Owner。",
    disableCondition: "不适用（常设任务）。",
    alertSources: ["control-center"],
  },
]

/** 耐久后台任务 kind 的可读名（未收录的原样展示 kind）。 */
const BACKGROUND_KIND_LABELS: Record<string, string> = {
  inspiration_process: "灵感处理",
  inspiration_pipeline: "灵感管道（视频链接→文案→拆解）",
  competitor_analysis: "同行对标分析",
  outbox_send: "回复外发队列",
  aim_channel_generate: "AIM 渠道生成",
  agent_remote_generate: "智能体远程调用",
  opportunity_analyze: "商机分析",
  newsroom_pipeline: "新闻室管道",
  topic_regenerate: "选题换一批",
}

export function backgroundKindLabel(kind: string): string {
  return BACKGROUND_KIND_LABELS[kind] ?? kind
}

function severityRank(severity: string): number {
  if (severity === "critical" || severity === "error") return 2
  if (severity === "warning") return 1
  return 0
}

function alertAppliesToTask(alert: LedgerAlertInput, spec: AutomationTaskSpec): boolean {
  if (alert.status === "resolved") return false
  return spec.alertSources.some((source) => alert.source.startsWith(source))
}

export function buildScheduledTaskLedger(
  specs: AutomationTaskSpec[],
  alerts: LedgerAlertInput[],
): AutomationTaskRow[] {
  return specs.map((spec) => {
    const matched = alerts.filter((alert) => alertAppliesToTask(alert, spec))
    const errors = matched.filter((alert) => severityRank(alert.severity) >= 2)
    const warnings = matched.filter((alert) => severityRank(alert.severity) === 1)
    const latest = matched.slice().sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0] ?? null
    const status: AutomationTaskStatus = errors.length > 0 ? "failing" : warnings.length > 0 ? "degraded" : "healthy"
    return {
      id: spec.id,
      name: spec.name,
      endpoint: spec.endpoint,
      cadence: spec.cadence,
      description: spec.description,
      ownerNote: spec.ownerNote,
      disableCondition: spec.disableCondition,
      status,
      openErrorCount: errors.length,
      openWarningCount: warnings.length,
      latestAlertSummary: latest?.summary ?? null,
      latestAlertAt: latest?.lastSeenAt ?? null,
    }
  })
}

const QUEUED_BACKLOG_DEGRADED_THRESHOLD = 20

export function buildBackgroundKindLedger(stats: LedgerKindStatsInput[]): BackgroundKindRow[] {
  return stats
    .map((entry) => {
      let status: AutomationTaskStatus
      if (entry.failedRecent > 0) status = "failing"
      else if (entry.queued > QUEUED_BACKLOG_DEGRADED_THRESHOLD) status = "degraded"
      else if (entry.completedRecent > 0) status = "healthy"
      else status = "idle"
      return { ...entry, status }
    })
    .sort((a, b) => {
      const rank: Record<AutomationTaskStatus, number> = { failing: 0, degraded: 1, idle: 2, healthy: 3 }
      return rank[a.status] - rank[b.status] || a.kind.localeCompare(b.kind)
    })
}

export function buildAutomationLedger(
  specs: AutomationTaskSpec[],
  alerts: LedgerAlertInput[],
  backgroundStats: LedgerKindStatsInput[],
  generatedAt: string,
): AutomationLedger {
  const scheduled = buildScheduledTaskLedger(specs, alerts)
  const background = buildBackgroundKindLedger(backgroundStats)
  const all = [...scheduled, ...background]
  return {
    generatedAt,
    scheduled,
    background,
    summary: {
      healthy: all.filter((row) => row.status === "healthy").length,
      degraded: all.filter((row) => row.status === "degraded").length,
      failing: all.filter((row) => row.status === "failing").length,
      idle: all.filter((row) => row.status === "idle").length,
    },
  }
}

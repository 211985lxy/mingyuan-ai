export type AutomationJobId =
  | "topic-daily"
  | "aihot-briefing"
  | "douyin-hot"
  | "market-hotlist"
  | "background-tasks"
  | "integration-probe"
  | "operational-alerts"
  | "audit-reconcile"
  | "outcome-flywheel"
  | "channel-metrics-rollup"
  | "control-center-retention"
  | "cleanup"

export interface AutomationJobCatalogEntry {
  id: AutomationJobId
  name: string
  purpose: string
  owner: string
  schedule: string
  disableCondition: string
  alertSources: string[]
  cronPath: string
}

/** 台账目录：给人看的用途，不是 cron 路径。V1 只读，停用条件只作说明。 */
export const AUTOMATION_JOB_CATALOG: AutomationJobCatalogEntry[] = [
  {
    id: "topic-daily",
    name: "每日选题推送",
    purpose: "每天把当日选题做成裁决卡推到飞书，等人点采用或换一批。",
    owner: "内容运营",
    schedule: "每天 09:10",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["topic-daily"],
    cronPath: "/api/cron/topic-daily",
  },
  {
    id: "aihot-briefing",
    name: "选题雷达早报",
    purpose: "整理当天行业线索，给选题当参考，不直接对外发。",
    owner: "内容运营",
    schedule: "每天 09:00",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["aihot-briefing"],
    cronPath: "/api/cron/aihot-briefing",
  },
  {
    id: "douyin-hot",
    name: "抖音热榜同步",
    purpose: "拉取抖音热榜快照，供选题判断对照。",
    owner: "内容运营",
    schedule: "每小时",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["douyin-hot"],
    cronPath: "/api/cron/douyin-hot",
  },
  {
    id: "market-hotlist",
    name: "市场热榜刷新",
    purpose: "生成市场热点快照，合并进选题雷达。",
    owner: "内容运营",
    schedule: "每天 08:30",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["market-hotlist"],
    cronPath: "/api/cron/market-hotlist",
  },
  {
    id: "background-tasks",
    name: "后台补做队列",
    purpose: "把灵感处理、对标分析、失败重试这些耗时活从对话里拆出去接着做。",
    owner: "系统",
    schedule: "每 5 分钟",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["background-tasks"],
    cronPath: "/api/cron/background-tasks",
  },
  {
    id: "integration-probe",
    name: "外部接口体检",
    purpose: "定时探一下抖音、飞书、对象存储这些有没有挂，挂了要能看见。",
    owner: "系统",
    schedule: "每 6 小时",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["integration-probe"],
    cronPath: "/api/cron/integration-probe",
  },
  {
    id: "operational-alerts",
    name: "经营告警巡检",
    purpose: "对账延迟、失败率过高等问题落成告警，必要时通知值班。",
    owner: "系统",
    schedule: "每 5 分钟",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["aim_execution", "operational-alerts"],
    cronPath: "/api/cron/operational-alerts",
  },
  {
    id: "audit-reconcile",
    name: "审计对账",
    purpose: "核对关键写入有没有对得上，对不上就告警。",
    owner: "系统",
    schedule: "每 5 分钟",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["audit_reconcile"],
    cronPath: "/api/cron/audit-reconcile",
  },
  {
    id: "outcome-flywheel",
    name: "效果复盘提醒",
    purpose: "看已发布内容有没有到该回填效果的日子，到期提醒，不替人填商业结果。",
    owner: "内容运营",
    schedule: "每天 04:00",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["outcome-flywheel"],
    cronPath: "/api/cron/outcome-flywheel",
  },
  {
    id: "channel-metrics-rollup",
    name: "渠道指标汇总",
    purpose: "把前一天各渠道的互动数字滚成日表，给看板用。",
    owner: "系统",
    schedule: "每天 00:10",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["channel-metrics-rollup"],
    cronPath: "/api/cron/channel-metrics-rollup",
  },
  {
    id: "control-center-retention",
    name: "控制台过期清理",
    purpose: "默认定时只出报告，不直接删；真删要额外确认。",
    owner: "系统",
    schedule: "每天 03:30",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["control-center-retention"],
    cronPath: "/api/cron/control-center-retention",
  },
  {
    id: "cleanup",
    name: "旧数据清理",
    purpose: "清过期热点快照和过期验证码，避免库里堆垃圾。",
    owner: "系统",
    schedule: "每天 03:00",
    disableCondition: "生产需审批后停定时器；本页开关只让任务空转。",
    alertSources: ["cleanup"],
    cronPath: "/api/cron/cleanup",
  },
]

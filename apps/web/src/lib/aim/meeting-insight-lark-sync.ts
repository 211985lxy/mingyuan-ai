/**
 * 会议洞察 → 飞书日历/任务 同步适配器（编排层）。
 *
 * 把 [meeting-insight.ts] 抽出的九类结构化产物中的「可执行项」反向写回飞书：
 *   - followUps / deliveryTasks → 飞书任务（task +create），due 在日历呈现 due-block
 *   - topicCandidates           → 内容排期日历的日程（calendar +create），每条 1h 占位
 *
 * 设计原则：
 * - 最小副作用：先跑 enabled + shadowMode 检查，不满足时返回 `skipped`，
 *   绝不静默吞掉调用方错误语义。
 * - 幂等：每条产物在飞书侧有可追踪的 `idempotency-key`（基于 insight 指纹）。
 * - 部分失败：N 条里 M 条失败，返回结构化的成功/失败明细，交由上层决定整体失败或告警。
 * - 与资产落地层解耦但形态一致：复用 [lark-cli-runner] 的统一网关，不新增第二套调用路径。
 * - 白名单安全：calendar / task 域 + 具体命令已在 lark-cli-runner 扩展。
 *
 * 无状态工具（config / 指纹 / 时区 / CLI 调用）抽到 [meeting-insight-lark-sync-helpers]。
 */
import type { MeetingInsight } from "@/lib/aim/meeting-insight"
import type { LarkCliRunner } from "@/lib/integrations/lark-cli-runner"
import { logger } from "@/lib/logger"
import {
  type MeetingInsightLarkSyncConfig,
  type LarkCliExecOptions,
  readMeetingInsightLarkSyncConfig,
  idempotencyKey,
  seedFromInsight,
  addDays,
  shanghaiScheduleIso,
  toIsoDate,
  toIso8601,
  buildDescription,
  sanitizeCliText,
  resolveOwnerToOpenId,
  createTask,
  createTopicCalendarEvent,
} from "@/lib/aim/meeting-insight-lark-sync-helpers"

// re-export 配置读取与类型，供 result-sink 等调用方就近导入
export {
  readMeetingInsightLarkSyncConfig,
  type MeetingInsightLarkSyncConfig,
}

// ─── 结果结构 ────────────────────────────────────────────────────────────────

export interface LarkSyncSkipResult {
  ok: true
  skipped: true
  reason: "disabled" | "shadow_mode" | "no_operable_items"
  // disabled / no_operable_items 恒为 0；shadow_mode 报告"本会创建多少"故为真实计数，统一放宽为 number。
  tasksCreated: number
  topicsCreated: number
}

export interface LarkSyncCreatedItem {
  kind: "task" | "calendar-event"
  source: "followUp" | "deliveryTask" | "topicCandidate"
  index: number
  title: string
  /** task guid 或 calendar event_id，shadow 模式为空串。 */
  id: string
  /** task 链接或日历日程链接，shadow 模式为空串。 */
  url: string
  error?: never
}

export interface LarkSyncFailedItem {
  kind: "task" | "calendar-event"
  source: "followUp" | "deliveryTask" | "topicCandidate"
  index: number
  title: string
  id?: never
  url?: never
  error: string
}

export interface LarkSyncOutcome {
  ok: true
  skipped?: false
  created: LarkSyncCreatedItem[]
  failed: LarkSyncFailedItem[]
  tasksCreated: number
  topicsCreated: number
}

export type MeetingInsightLarkSyncResult = LarkSyncOutcome | LarkSyncSkipResult

// ─── 选项 ────────────────────────────────────────────────────────────────────

export interface SyncMeetingInsightToLarkOptions {
  insight: MeetingInsight
  config: MeetingInsightLarkSyncConfig
  /** 经营事项 ID（写入日程/任务描述做追溯）。 */
  recordId?: string
  /** 客户会议洞察在 AIM 内的结果页或飞书 Doc URL（写入描述）。 */
  resultLink?: string
  /** lark-cli runner（测试用）。 */
  runner?: LarkCliRunner
  /** lark-cli 路径（测试/特定环境用）。 */
  cliPath?: string
  /** 环境变量来源（测试/部署隔离用）。 */
  env?: Record<string, string | undefined>
  /** 飞书身份：user 或 bot；默认 user。 */
  identity?: "user" | "bot"
  /** 今日锚点（测试用，默认真今日）。 */
  today?: Date
}

// ─── 对外 API ────────────────────────────────────────────────────────────────

/**
 * 把 meeting-insight 域层产物同步到飞书任务与日历。
 *
 * 错误策略：
 * - 开关关闭 / Shadow Mode → 走 skipped 分支，调用方不需要告警。
 * - 单条创建失败 → 放入 failed 明细，不抛错，整体仍 ok:true。
 *   调用方根据 failed.length 决定是否升级告警。
 * - 参数错误（如配置非法）→ 直接抛错，交给上层 result-sink。
 */
export async function syncMeetingInsightToLark(
  opts: SyncMeetingInsightToLarkOptions,
): Promise<MeetingInsightLarkSyncResult> {
  const { insight, config } = opts

  const skip = evaluateSkip(insight, config)
  if (skip) return skip

  const today = opts.today ?? new Date()
  const seed = seedFromInsight(insight)
  const created: LarkSyncCreatedItem[] = []
  const failed: LarkSyncFailedItem[] = []

  await syncFollowUps(insight, config, seed, today, opts, created, failed)
  await syncDeliveryTasks(insight, config, seed, today, opts, created, failed)
  await syncTopicCandidates(insight, config, today, opts, created, failed)

  const tasksCreated = created.filter((c) => c.kind === "task").length
  const topicsCreated = created.filter((c) => c.kind === "calendar-event").length

  logger.info(
    { created: created.length, failed: failed.length, tasksCreated, topicsCreated, customer: insight.customer },
    "[lark-sync] 会议洞察同步飞书完成",
  )
  if (failed.length > 0) {
    logger.warn(
      { failures: failed.map((f) => ({ kind: f.kind, source: f.source, index: f.index, error: f.error.slice(0, 200) })) },
      "[lark-sync] 部分条目创建失败",
    )
  }

  return { ok: true, created, failed, tasksCreated, topicsCreated }
}

/**
 * 评估是否应跳过同步：关闭 / 无可执行项 / Shadow Mode。
 * 返回 skip 结果对象则直接透传，返回 undefined 表示继续真实创建。
 */
function evaluateSkip(
  insight: MeetingInsight,
  config: MeetingInsightLarkSyncConfig,
): MeetingInsightLarkSyncResult | undefined {
  if (!config.enabled) {
    return { ok: true, skipped: true, reason: "disabled", tasksCreated: 0, topicsCreated: 0 }
  }
  const hasItems =
    insight.followUps.length > 0 ||
    insight.deliveryTasks.length > 0 ||
    insight.topicCandidates.length > 0
  if (!hasItems) {
    return { ok: true, skipped: true, reason: "no_operable_items", tasksCreated: 0, topicsCreated: 0 }
  }
  if (config.shadowMode) {
    logger.info(
      {
        followUps: insight.followUps.length,
        deliveryTasks: insight.deliveryTasks.length,
        topicCandidates: insight.topicCandidates.length,
        customer: insight.customer,
      },
      "[lark-sync] Shadow Mode：跳过真实创建任务/日程",
    )
    return {
      ok: true,
      skipped: true,
      reason: "shadow_mode",
      tasksCreated: insight.followUps.length + insight.deliveryTasks.length,
      topicsCreated: insight.topicCandidates.length,
    }
  }
  return undefined
}

// ─── 分项同步（每项独立 try/catch，单条失败不阻断其它） ──────────────────────

type ExecOpts = Pick<SyncMeetingInsightToLarkOptions, "recordId" | "resultLink" | "identity" | "runner" | "cliPath" | "env">

/** 把 options 里 CLI 执行相关字段投影成 helpers 期望的子集。 */
function execOpts(opts: SyncMeetingInsightToLarkOptions): LarkCliExecOptions & { insight: MeetingInsight; recordId?: string; resultLink?: string } {
  return {
    insight: opts.insight,
    recordId: opts.recordId,
    resultLink: opts.resultLink,
    runner: opts.runner,
    cliPath: opts.cliPath,
    env: opts.env,
    identity: opts.identity,
  }
}

/** followUps → 飞书任务。 */
async function syncFollowUps(
  insight: MeetingInsight,
  config: MeetingInsightLarkSyncConfig,
  seed: string,
  today: Date,
  opts: SyncMeetingInsightToLarkOptions,
  created: LarkSyncCreatedItem[],
  failed: LarkSyncFailedItem[],
): Promise<void> {
  const e = execOpts(opts)
  for (let i = 0; i < insight.followUps.length; i++) {
    const text = insight.followUps[i]
    const title = `【跟进建议】${sanitizeCliText(text, false).slice(0, 80)}`
    try {
      const due = toIsoDate(addDays(today, config.followUpDefaultDueDays))
      const result = await createTask(
        { summary: title, description: buildDescription(text, e), dueDate: due, assignee: config.defaultAssigneeOpenId, idempotencyKey: idempotencyKey("fu", seed, i) },
        e,
      )
      created.push({ kind: "task", source: "followUp", index: i, title, id: result.guid, url: result.url })
    } catch (err) {
      failed.push({ kind: "task", source: "followUp", index: i, title, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

/** deliveryTasks → 飞书任务。 */
async function syncDeliveryTasks(
  insight: MeetingInsight,
  config: MeetingInsightLarkSyncConfig,
  seed: string,
  today: Date,
  opts: SyncMeetingInsightToLarkOptions,
  created: LarkSyncCreatedItem[],
  failed: LarkSyncFailedItem[],
): Promise<void> {
  const e = execOpts(opts)
  for (let i = 0; i < insight.deliveryTasks.length; i++) {
    const t = insight.deliveryTasks[i]
    const title = `【交付任务】${sanitizeCliText(t.title, false).slice(0, 80)}`
    try {
      const due = toIsoDate(addDays(today, config.deliveryDefaultDueDays))
      const assignee = resolveOwnerToOpenId(t.owner) ?? config.defaultAssigneeOpenId
      const result = await createTask(
        { summary: title, description: buildDescription(t.owner ? `负责人：${t.owner}\n任务：${t.title}` : t.title, e), dueDate: due, assignee, idempotencyKey: idempotencyKey("dt", seed, i) },
        e,
      )
      created.push({ kind: "task", source: "deliveryTask", index: i, title, id: result.guid, url: result.url })
    } catch (err) {
      failed.push({ kind: "task", source: "deliveryTask", index: i, title, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

/** topicCandidates → 飞书日历日程（1h，today+2+i 天 10:00 起，全程上海墙钟）。 */
async function syncTopicCandidates(
  insight: MeetingInsight,
  config: MeetingInsightLarkSyncConfig,
  today: Date,
  opts: SyncMeetingInsightToLarkOptions,
  created: LarkSyncCreatedItem[],
  failed: LarkSyncFailedItem[],
): Promise<void> {
  const e = execOpts(opts)
  for (let i = 0; i < insight.topicCandidates.length; i++) {
    const topic = insight.topicCandidates[i]
    const title = `【内容选题】${sanitizeCliText(topic, false).slice(0, 80)}`
    try {
      const startIso = shanghaiScheduleIso(today, 2 + i, 10, 0)
      const endIso = toIso8601(new Date(new Date(startIso).getTime() + config.topicDefaultMinutes * 60_000))
      const result = await createTopicCalendarEvent(
        { summary: title, description: buildDescription(`选题内容：${topic}\n来源：会议洞察 topicCandidates[${i}]`, e), start: startIso, end: endIso, calendarId: config.topicCalendarId },
        e,
      )
      created.push({ kind: "calendar-event", source: "topicCandidate", index: i, title, id: result.eventId, url: result.url })
    } catch (err) {
      failed.push({ kind: "calendar-event", source: "topicCandidate", index: i, title, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

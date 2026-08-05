/**
 * meeting-insight-lark-sync 的无状态工具层。
 *
 * 从 [meeting-insight-lark-sync.ts] 抽出的纯函数与飞书 CLI 调用包装，
 * 使主文件聚焦于「编排 + 分项同步」逻辑，控制在架构大小策略的行数上限内。
 *
 * 内容分组：
 * - 配置解析（parseNonNegativeInt / readMeetingInsightLarkSyncConfig）
 * - 幂等指纹（idempotencyKey / simpleHash / seedFromInsight）
 * - 时区（全部显式 Asia/Shanghai 墙钟，跨部署时区安全）
 * - 文本规整（sanitizeCliText / buildDescription / resolveOwnerToOpenId）
 * - 飞书 CLI 调用包装（createTask / createTopicCalendarEvent，复用 lark-cli-runner 网关）
 */
import type { MeetingInsight } from "@/lib/aim/meeting-insight"
import {
  runLarkCliCommand,
  type LarkCliRunner,
} from "@/lib/integrations/lark-cli-runner"

// ─── 配置 ────────────────────────────────────────────────────────────────────

export interface MeetingInsightLarkSyncConfig {
  /** 功能开关；关闭时整体 skipped。 */
  enabled: boolean
  /** Shadow Mode：只写日志、不真实创建。 */
  shadowMode: boolean
  /** 跟进建议的默认 due 天（从「今日」起算）。未配置为 1。 */
  followUpDefaultDueDays: number
  /** 交付任务的默认 due 天（从「今日」起算）。未配置为 3。 */
  deliveryDefaultDueDays: number
  /** 选题日程默认时长（分钟）。未配置为 60。 */
  topicDefaultMinutes: number
  /** 选题排期的日历 ID；空则落到用户主日历。 */
  topicCalendarId?: string
  /** 默认负责人的飞书 open_id；owner 未匹配时落到此人。 */
  defaultAssigneeOpenId?: string
}

export function readMeetingInsightLarkSyncConfig(
  env: Record<string, string | undefined> = process.env,
): MeetingInsightLarkSyncConfig {
  return {
    enabled: env.AIM_LARK_SYNC_ENABLED?.trim() === "1",
    shadowMode: env.AIM_LARK_SYNC_SHADOW?.trim() === "1",
    // 用非负整数解析，避免 `Number(x) || n` 把合法的 0 当 falsy 吞掉、
    // 也避免负数透传导致 due 在过去 / 日程 end 早于 start。
    followUpDefaultDueDays: parseNonNegativeInt(env.AIM_LARK_SYNC_FOLLOW_UP_DUE_DAYS, 1),
    deliveryDefaultDueDays: parseNonNegativeInt(env.AIM_LARK_SYNC_DELIVERY_DUE_DAYS, 3),
    topicDefaultMinutes: parseNonNegativeInt(env.AIM_LARK_SYNC_TOPIC_MINUTES, 60),
    topicCalendarId: env.AIM_LARK_SYNC_TOPIC_CALENDAR_ID?.trim() || undefined,
    defaultAssigneeOpenId: env.AIM_LARK_SYNC_DEFAULT_ASSIGNEE?.trim() || undefined,
  }
}

/**
 * 把环境变量解析为非负整数；非法 / 空 / 负数 → 返回 fallback。
 * 注意：不能用 `Number(x) || fallback`，因为 `Number("0") === 0` 是 falsy 会被吞掉。
 */
export function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim()
  if (!trimmed) return fallback
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 0) return fallback
  return n
}

// ─── 幂等指纹 ────────────────────────────────────────────────────────────────

/** 构造稳定的幂等键：对相同 insight / 同一子项反复调用不会重复建。 */
export function idempotencyKey(kind: string, seed: string, index: number): string {
  return `mi_${kind}_${simpleHash(seed)}_${index}`
}

export function simpleHash(text: string): string {
  let h = 2_166_136_261
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 1_677_761)
  }
  return (h >>> 0).toString(36).slice(0, 10)
}

export function seedFromInsight(insight: MeetingInsight): string {
  return [
    insight.customer,
    insight.meetingTitle,
    ...insight.pains,
    ...insight.goals,
    ...insight.deliveryTasks.map((t) => t.title + (t.owner ?? "")),
  ].join("|")
}

// ─── 时区（全部 Asia/Shanghai 墙钟，跨部署时区安全） ──────────────────────────

const SHANGHAI_TZ = "Asia/Shanghai"

interface WallClockParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
}

/** 取一个 Date 在 Asia/Shanghai 时区下的墙钟分量（不受本机 TZ 影响）。 */
export function shanghaiParts(date: Date): WallClockParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? ""
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24, // hour12:false 下 "24" 归零
    minute: Number(get("minute")),
  }
}

/**
 * 按上海时区墙钟加 N 天，返回的 Date 其上海墙钟时分保持不变。
 * 不能用 `setDate`+本机 `getDate`，否则跨时区部署会偏移。
 */
export function addDays(date: Date, days: number): Date {
  const p = shanghaiParts(date)
  // 以上海日期为基准加 days 天（跨月由 UTC 中转正确进位），时分沿用上海墙钟值。
  const base = new Date(
    `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T00:00:00+08:00`,
  )
  base.setUTCDate(base.getUTCDate() + days)
  const bp = shanghaiParts(base)
  const hh = String(p.hour).padStart(2, "0")
  const mm = String(p.minute).padStart(2, "0")
  return new Date(
    `${bp.year}-${String(bp.month).padStart(2, "0")}-${String(bp.day).padStart(2, "0")}T${hh}:${mm}+08:00`,
  )
}

/**
 * 给定锚点时间，返回「上海墙钟日期 + days 天，于 hour:minute（上海墙钟）」的 ISO 8601 时刻。
 * 全程用上海墙钟分量计算 + 纯字符串拼接，绝不依赖部署机器 TZ，用于飞书日历日程 start。
 */
export function shanghaiScheduleIso(today: Date, days: number, hour: number, minute: number): string {
  const p = shanghaiParts(today)
  // 在上海墙钟日期上加 days 天，用 UTC 中转（+08:00）保证跨月进位正确。
  const base = new Date(
    `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T00:00:00+08:00`,
  )
  base.setUTCDate(base.getUTCDate() + days)
  const bp = shanghaiParts(base) // 偏移后的上海墙钟日期（跨月已进位）
  const hh = String(hour).padStart(2, "0")
  const mm = String(minute).padStart(2, "0")
  return `${bp.year}-${String(bp.month).padStart(2, "0")}-${String(bp.day).padStart(2, "0")}T${hh}:${mm}+08:00`
}

/** 上海时区的日期串（YYYY-MM-DD），用于飞书任务 due。 */
export function toIsoDate(date: Date): string {
  const p = shanghaiParts(date)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/** 上海时区的 ISO 8601 时刻（YYYY-MM-DDTHH:mm+08:00），用于飞书日历 start/end。 */
export function toIso8601(date: Date): string {
  const p = shanghaiParts(date)
  const hh = String(p.hour).padStart(2, "0")
  const mm = String(p.minute).padStart(2, "0")
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${hh}:${mm}+08:00`
}

// ─── 文本规整 ────────────────────────────────────────────────────────────────

/**
 * 规整即将拼入飞书 CLI 参数的文本：
 * - 去掉控制字符（避免 CLI 参数解析脆弱）；
 * - collapse 连续空白；
 * - allowNewline=false 时连换行也压成空格（用于单行 summary/标题）。
 * 长度裁剪仍由调用方 slice 负责。
 */
export function sanitizeCliText(input: string, allowNewline: boolean): string {
  if (allowNewline) {
    return input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/[^\S\n]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim()
  }
  return input.replace(/[\x00-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim()
}

/** 描述拼接（受 2000 字上限保护），每段输入做控制字符清洗。 */
export function buildDescription(prefix: string, opts: {
  insight: MeetingInsight
  recordId?: string
  resultLink?: string
}): string {
  const parts: string[] = [sanitizeCliText(prefix, true)]
  if (opts.recordId) parts.push(`经营事项ID：${sanitizeCliText(opts.recordId, true)}`)
  if (opts.resultLink) parts.push(`AIM结果：${sanitizeCliText(opts.resultLink, true)}`)
  if (opts.insight.customer) parts.push(`客户：${sanitizeCliText(opts.insight.customer, true)}`)
  return parts.join("\n").slice(0, 2000)
}

/**
 * owner 文本 → 飞书 open_id 解析占位。
 * 已经是 open_id 形态（ou_xxx）直接透传；姓名等其它文本留空，由 defaultAssigneeOpenId 兜底。
 */
export function resolveOwnerToOpenId(owner?: string): string | undefined {
  const trimmed = owner?.trim()
  if (!trimmed) return undefined
  if (/^ou_[a-zA-Z0-9]+$/.test(trimmed)) return trimmed
  return undefined
}

// ─── 飞书 CLI 调用包装（复用 lark-cli-runner 网关） ────────────────────────────

/** 同步选项中与 CLI 执行相关的子集（createTask/createTopicCalendarEvent 共用）。 */
export interface LarkCliExecOptions {
  runner?: LarkCliRunner
  cliPath?: string
  env?: Record<string, string | undefined>
  identity?: "user" | "bot"
}

interface CreateTaskArgs {
  summary: string
  description: string
  dueDate: string
  assignee?: string
  idempotencyKey: string
}

/** 创建一条飞书任务（task +create）。 */
export async function createTask(
  args: CreateTaskArgs,
  opts: LarkCliExecOptions,
): Promise<{ guid: string; url: string }> {
  const cliArgs: string[] = [
    "--summary", args.summary,
    "--description", args.description,
    "--due", args.dueDate,
    "--idempotency-key", args.idempotencyKey,
  ]
  if (args.assignee) cliArgs.push("--assignee", args.assignee)

  const payload = (await runLarkCliCommand({
    domain: "task",
    command: "+create",
    args: cliArgs,
    identity: opts.identity ?? "user",
    runner: opts.runner,
    cliPath: opts.cliPath,
    env: opts.env,
  })) as { data?: { guid?: string; url?: string } }

  return { guid: payload?.data?.guid ?? "", url: payload?.data?.url ?? "" }
}

interface CreateTopicCalendarArgs {
  summary: string
  description: string
  start: string // ISO 8601
  end: string // ISO 8601
  calendarId?: string
}

/** 创建一条飞书日历日程（calendar +create），用于选题排期。 */
export async function createTopicCalendarEvent(
  args: CreateTopicCalendarArgs,
  opts: LarkCliExecOptions,
): Promise<{ eventId: string; url: string }> {
  const cliArgs: string[] = [
    "--summary", args.summary,
    "--start", args.start,
    "--end", args.end,
    "--description", args.description,
  ]
  if (args.calendarId) cliArgs.push("--calendar-id", args.calendarId)

  const payload = (await runLarkCliCommand({
    domain: "calendar",
    command: "+create",
    args: cliArgs,
    identity: opts.identity ?? "user",
    runner: opts.runner,
    cliPath: opts.cliPath,
    env: opts.env,
  })) as { data?: { event_id?: string } }

  const eventId = payload?.data?.event_id ?? ""
  // CLI 返回里没有直接的 applink，用 event_id 做可追踪占位。
  return { eventId, url: eventId ? `feishu://calendar/event/${eventId}` : "" }
}

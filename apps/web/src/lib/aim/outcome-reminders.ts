/**
 * 经营结果回填提醒（90 天计划 3.2）。
 *
 * 发布事实以 AimGeneration 为准：workflowStatus=published 且有 publishedAt。
 * 发布后第 7 / 14 / 30 天为回填窗口：
 * - 窗口到期且没有对应 ContentOutcome 行 → missing="row"
 * - 有行但业务字段（有效评论/私信/有效线索/诊断预约/成交数/收入/用户判断）
 *   全部为空 → missing="metrics"
 * - 任一业务字段已填（含显式填 0）即视为已回填，不再提醒
 *
 * 空值语义与 ContentOutcome 一致：没数据就留空，不填 0、不让 AI 猜测。
 * 本模块只读不写；提醒的推送（飞书）由上层调用方决定。
 */

export const OUTCOME_REMINDER_WINDOWS = [7, 14, 30] as const
export type OutcomeReminderWindow = (typeof OUTCOME_REMINDER_WINDOWS)[number]

export interface OutcomeReminderDue {
  generationId: string
  projectId: string | null
  topicTitle: string | null
  windowDay: OutcomeReminderWindow
  publishedAt: Date
  dueAt: Date
  missing: "row" | "metrics"
  platform: string | null
  publishUrl: string | null
}

interface PublishedGenerationRow {
  id: string
  projectId: string | null
  topicTitle: string | null
  publishedAt: Date | null
  publishPlatform: string | null
  publishUrl: string | null
}

interface OutcomeMetricRow {
  generationId: string
  collectWindowDay: number
  qualifiedCommentCount: number | null
  dmCount: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: unknown
  userVerdict: string | null
}

/** prisma 的最小投影（便于注入测试替身）。 */
export interface OutcomeReminderStorePort {
  aimGeneration: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<
      PublishedGenerationRow[]
    >
  }
  contentOutcome: {
    findMany(args: {
      where: { userId?: string; generationId: { in: string[] } }
      take?: number
    }): Promise<OutcomeMetricRow[]>
  }
}

const DAY_MS = 24 * 3600 * 1000

/** 任一业务字段已填（含显式 0）即视为已回填。 */
function hasAnyBusinessMetric(row: OutcomeMetricRow): boolean {
  return [
    row.qualifiedCommentCount,
    row.dmCount,
    row.qualifiedLeadCount,
    row.appointmentCount,
    row.dealCount,
    row.revenue,
    row.userVerdict,
  ].some((value) => value != null && value !== "")
}

/**
 * 找出当前用户到期未回填的经营结果提醒，按到期时间升序。
 */
/**
 * @description 查找dueoutcomereminders
 * @param input - 输入数据
 * @returns Promise<OutcomeReminderDue[]>
 */
export async function findDueOutcomeReminders(input: {
  userId: string
  now?: Date
  store: OutcomeReminderStorePort
}): Promise<OutcomeReminderDue[]> {
  const now = input.now ?? new Date()
  const generations = await input.store.aimGeneration.findMany({
    where: { userId: input.userId, workflowStatus: "published", publishedAt: { not: null } },
    take: 500,
  })
  const published = generations.filter((g) => g.publishedAt != null)
  if (published.length === 0) return []

  const outcomes = await input.store.contentOutcome.findMany({
    where: { userId: input.userId, generationId: { in: published.map((g) => g.id) } },
    take: 2000,
  })

  const reminders: OutcomeReminderDue[] = []
  for (const generation of published) {
    const publishedAt = generation.publishedAt as Date
    for (const windowDay of OUTCOME_REMINDER_WINDOWS) {
      const dueAt = new Date(publishedAt.getTime() + windowDay * DAY_MS)
      if (now.getTime() < dueAt.getTime()) continue
      const row = outcomes.find(
        (o) => o.generationId === generation.id && o.collectWindowDay === windowDay,
      )
      const missing = !row ? "row" : hasAnyBusinessMetric(row) ? null : "metrics"
      if (!missing) continue
      reminders.push({
        generationId: generation.id,
        projectId: generation.projectId,
        topicTitle: generation.topicTitle,
        windowDay,
        publishedAt,
        dueAt,
        missing,
        platform: generation.publishPlatform,
        publishUrl: generation.publishUrl,
      })
    }
  }

  return reminders.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
}

/**
 * @description 格式化到期回填提醒文案（供 cron 飞书推送 / UI 展示）
 */
export function formatOutcomeReminderDigest(reminders: OutcomeReminderDue[], limit = 8): string {
  if (reminders.length === 0) return ""
  const lines = reminders.slice(0, limit).map((item) => {
    const title = item.topicTitle?.trim() || item.generationId.slice(0, 8)
    const missing = item.missing === "row" ? "尚未建回填行" : "业务指标仍为空"
    return `- ${title} · 第 ${item.windowDay} 天 · ${missing}`
  })
  const more = reminders.length > limit ? `\n…另有 ${reminders.length - limit} 条` : ""
  return [
    "【经营结果回填提醒】",
    `共 ${reminders.length} 条已发布内容需回填 7/14/30 天结果：`,
    ...lines,
    more,
    "请打开 AiM 填写复盘 / 结果回填。",
  ].filter(Boolean).join("\n")
}

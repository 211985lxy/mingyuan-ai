import { shanghaiDateText } from "@/lib/shanghai-time"
import { prisma } from "@/lib/prisma"

export const CONTROL_CENTER_RETENTION_DAYS = 180
export const RETENTION_BATCH_SIZE = 1000
export const RETENTION_MAX_BATCHES = 20

interface CountDelegate {
  count(args: unknown): Promise<number>
}

interface DeleteDelegate extends CountDelegate {
  findMany(args: unknown): Promise<Array<{ id: string }>>
  deleteMany(args: unknown): Promise<{ count: number }>
}

interface RetentionDelegates {
  auditEvent?: DeleteDelegate
  channelMetricDaily?: DeleteDelegate
}

function getDelegates(): RetentionDelegates {
  const source = prisma as unknown as RetentionDelegates
  return { auditEvent: source.auditEvent, channelMetricDaily: source.channelMetricDaily }
}

function cutoff(now: Date): { occurredAt: Date; day: string } {
  const date = new Date(now.getTime() - CONTROL_CENTER_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  return { occurredAt: date, day: shanghaiDateText(date) }
}

export interface RetentionPreview {
  cutoffAt: string
  cutoffDay: string
  auditEventExpired: number
  channelMetricDailyExpired: number
  totalExpired: number
}

export interface RetentionResult extends RetentionPreview {
  execute: boolean
  auditEventDeleted: number
  channelMetricDailyDeleted: number
  batches: number
}

export async function previewControlCenterRetention(now = new Date()): Promise<RetentionPreview> {
  const delegates = getDelegates()
  const boundary = cutoff(now)
  const [auditEventExpired, channelMetricDailyExpired] = await Promise.all([
    delegates.auditEvent?.count({ where: { ingestedAt: { lt: boundary.occurredAt } } }) ?? 0,
    delegates.channelMetricDaily?.count({ where: { day: { lt: boundary.day } } }) ?? 0,
  ])
  return {
    cutoffAt: boundary.occurredAt.toISOString(),
    cutoffDay: boundary.day,
    auditEventExpired,
    channelMetricDailyExpired,
    totalExpired: auditEventExpired + channelMetricDailyExpired,
  }
}

async function deleteBatches(delegate: DeleteDelegate | undefined, where: Record<string, unknown>): Promise<{ deleted: number; batches: number }> {
  if (!delegate) return { deleted: 0, batches: 0 }
  let deleted = 0
  let batches = 0
  while (batches < RETENTION_MAX_BATCHES) {
    const rows = await delegate.findMany({ where, select: { id: true }, take: RETENTION_BATCH_SIZE })
    if (rows.length === 0) break
    const result = await delegate.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } })
    deleted += result.count
    batches += 1
    if (rows.length < RETENTION_BATCH_SIZE) break
  }
  return { deleted, batches }
}

export async function deleteExpiredControlCenterRows(input: { now?: Date; execute: boolean }): Promise<RetentionResult> {
  const now = input.now ?? new Date()
  const preview = await previewControlCenterRetention(now)
  if (!input.execute) return { ...preview, execute: false, auditEventDeleted: 0, channelMetricDailyDeleted: 0, batches: 0 }
  const boundary = cutoff(now)
  const delegates = getDelegates()
  const [audit, channel] = await Promise.all([
    deleteBatches(delegates.auditEvent, { ingestedAt: { lt: boundary.occurredAt } }),
    deleteBatches(delegates.channelMetricDaily, { day: { lt: boundary.day } }),
  ])
  return {
    ...preview,
    execute: true,
    auditEventDeleted: audit.deleted,
    channelMetricDailyDeleted: channel.deleted,
    batches: audit.batches + channel.batches,
  }
}

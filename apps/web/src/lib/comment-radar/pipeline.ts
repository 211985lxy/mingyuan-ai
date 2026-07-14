import { prisma } from '@/lib/prisma'
import { resolveSource } from './source-resolver'
import { collectSourceItemPages } from './collector'
import type { JobStatus, CommentRadarPlatform, JobProgress } from './types'
import { createJobSchema } from './schemas'
const TR: Partial<Record<JobStatus, Set<JobStatus>>> = {
  pending: new Set(['resolving', 'failed']), resolving: new Set(['collecting', 'failed', 'partial']),
  collecting: new Set(['collecting', 'completed', 'partial', 'failed']), analyzing: new Set(['completed', 'failed']),
  partial: new Set(['collecting', 'completed', 'failed']),
}
export function canTransition(c: JobStatus, n: JobStatus): boolean { return TR[c]?.has(n) ?? false }
export function isTerminalStatus(s: JobStatus): boolean { return s === 'completed' || s === 'failed' }
export interface StatusCheckInput { totalItems: number; processedItems: number; failedItems: number; hasMoreOnAnyItem: boolean }
export function getNextJobStatus(i: StatusCheckInput): JobStatus {
  if (i.processedItems + i.failedItems < i.totalItems || i.hasMoreOnAnyItem) return 'collecting'
  return i.failedItems > 0 ? 'partial' : 'completed'
}
type JR = { id: string; userId: string; sourceUrl: string; platform: string; sourceType: string; status: string; videoLimit: number; totalItems: number; processedItems: number; failedItems: number; reportedCommentCount: number; collectedCommentCount: number; analyzedSampleCount: number; analysisResult: unknown; partialReason: string | null; errorMessage: string | null; completedAt: Date | null; createdAt: Date; updatedAt: Date; sourceItems: Array<{ id: string; jobId: string; platformItemId: string; sourceUrl: string; title: string; reportedCommentCount: number; cursor: string; hasMore: boolean; status: string; errorMessage: string | null }> }
async function lj(uid: string, jid: string): Promise<JR | null> { return prisma.commentInsightJob.findFirst({ where: { id: jid, userId: uid }, include: { sourceItems: { orderBy: { createdAt: 'asc' } } } }) as Promise<JR | null> }
export async function createJob(uid: string, inp: { url: string; accountVideoLimit?: number }) {
  const p = createJobSchema.parse(inp); const r = resolveSource(p.url); if (!r) throw new Error('不支持的平台或链接格式，目前支持抖音和小红书')
  return prisma.commentInsightJob.create({ data: { userId: uid, sourceUrl: r.rawUrl, platform: r.platform, sourceType: r.sourceType, videoLimit: r.videoLimit, status: 'pending' } })
}
export async function listJobsForUser(uid: string, take = 10) { return prisma.commentInsightJob.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take }) }
export async function getJobForUser(uid: string, jid: string) { return lj(uid, jid) }
export interface SyncResult extends JobProgress { jobId: string }
function toSR(j: JR): SyncResult {
  const pi = j.sourceItems.find(si => si.status !== 'completed' && si.hasMore); const s = j.status as JobStatus
  return { jobId: j.id, status: s, totalItems: j.totalItems, processedItems: j.processedItems, failedItems: j.failedItems, reportedCommentCount: j.reportedCommentCount, collectedCommentCount: j.collectedCommentCount, currentItemTitle: pi?.title ?? null, canContinue: !isTerminalStatus(s), partialReason: j.partialReason, errorMessage: j.errorMessage }
}
export async function syncJobForUser(uid: string, jid: string): Promise<SyncResult | null> {
  const j = await lj(uid, jid); if (!j) return null; const st = j.status as JobStatus
  if (isTerminalStatus(st)) return toSR(j)
  if (st === 'pending') {
    await prisma.commentInsightJob.update({ where: { id: jid }, data: { status: 'resolving' } })
    const r = resolveSource(j.sourceUrl)
    if (r?.sourceType === 'video' && r.itemId) {
      await prisma.commentSourceItem.create({ data: { jobId: jid, platformItemId: r.itemId, sourceUrl: j.sourceUrl, title: r.itemId, status: 'pending', hasMore: true, cursor: '' } })
      await prisma.commentInsightJob.update({ where: { id: jid }, data: { status: 'collecting', totalItems: 1 } })
      return syncJobForUser(uid, jid)
    }
    await prisma.commentInsightJob.update({ where: { id: jid }, data: { status: 'partial', partialReason: r?.sourceType === 'account' ? '账号链接采集将在后续版本支持' : '短链解析将在后续版本支持' } })
    return toSR((await lj(uid, jid))!)
  }
  if (st === 'collecting' || st === 'partial') {
    const pi = j.sourceItems.find(si => si.status !== 'completed' && si.hasMore)
    if (!pi) {
      const hm: boolean = j.sourceItems.some(si => si.hasMore && si.status !== 'failed')
      const ns = getNextJobStatus({ totalItems: j.totalItems, processedItems: j.processedItems, failedItems: j.failedItems, hasMoreOnAnyItem: hm })
      await prisma.commentInsightJob.update({ where: { id: jid }, data: { status: ns, completedAt: isTerminalStatus(ns) ? new Date() : null, partialReason: ns === 'partial' ? '部分作品采集失败' : null } })
      return toSR((await lj(uid, jid))!)
    }
    const ex = await prisma.commentRecord.findMany({ where: { jobId: jid, sourceItemId: pi.id }, select: { platformCommentId: true } })
    const eids = new Set(ex.map(c => c.platformCommentId))
    const cr = await collectSourceItemPages(
      { jobId: jid, sourceItemId: pi.id, platform: j.platform as CommentRadarPlatform, platformItemId: pi.platformItemId, cursor: pi.cursor, hasMore: pi.hasMore },
      { maxPages: 5, existingCommentIds: eids, persistPage: async (jId, siId, cs, nc, hm) => {
        for (const c of cs) { try { await prisma.commentRecord.create({ data: { jobId: jId, sourceItemId: siId, platformCommentId: c.commentId || `gen_${Date.now()}_${Math.random().toString(36).slice(2)}`, text: c.text, nickname: c.nickname ?? null, likes: c.likes, createTime: c.createTime, isTop: c.isTop } }) } catch {} }
        await prisma.commentSourceItem.update({ where: { id: siId }, data: { cursor: String(nc), hasMore: hm, status: hm ? 'collecting' : 'completed' } })
        return { cursor: String(nc), hasMore: hm }
      } },
    )
    if (cr.rateLimited) await prisma.commentInsightJob.update({ where: { id: jid }, data: { status: 'partial', partialReason: '平台限流，暂停采集' } })
    else if (cr.error) await prisma.commentSourceItem.update({ where: { id: pi.id }, data: { status: 'failed', errorMessage: cr.error } })
    const ai = await prisma.commentSourceItem.findMany({ where: { jobId: jid } }); const cc = await prisma.commentRecord.count({ where: { jobId: jid } })
    await prisma.commentInsightJob.update({ where: { id: jid }, data: { processedItems: ai.filter(si => si.status === 'completed' || (!si.hasMore && si.status !== 'pending')).length, failedItems: ai.filter(si => si.status === 'failed').length, collectedCommentCount: cc } })
    return toSR((await lj(uid, jid))!)
  }
  return toSR(j)
}

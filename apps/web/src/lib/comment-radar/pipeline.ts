import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { resolveSource } from './source-resolver'
import { collectSourceItemPages } from './collector'
import type { JobStatus, CommentRadarPlatform, JobProgress } from './types'
import { createJobSchema } from './schemas'
const TR: Partial<Record<JobStatus, Set<JobStatus>>> = {
  pending: new Set(['resolving', 'failed']), resolving: new Set(['collecting', 'failed', 'partial']),
  collecting: new Set(['collecting', 'completed', 'partial', 'analyzing', 'failed']), analyzing: new Set(['completed', 'failed']),
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
export async function syncJobForUser(uid: string, jid: string, depth = 0): Promise<SyncResult | null> {
  const j = await lj(uid, jid); if (!j) return null; const st = j.status as JobStatus
  if (isTerminalStatus(st) || depth > 3) return toSR(j)
  if (st === 'pending') {
    await prisma.commentInsightJob.update({ where: { id: jid }, data: { status: 'resolving' } })
    const r = resolveSource(j.sourceUrl)
    if (r?.sourceType === 'video' && r.itemId) {
      await prisma.commentSourceItem.create({ data: { jobId: jid, platformItemId: r.itemId, sourceUrl: j.sourceUrl, title: r.itemId, status: 'pending', hasMore: true, cursor: '' } })
      await prisma.commentInsightJob.update({ where: { id: jid }, data: { status: 'collecting', totalItems: 1 } })
      return syncJobForUser(uid, jid, depth + 1)
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
        for (const c of cs) { try { await prisma.commentRecord.create({ data: { jobId: jId, sourceItemId: siId, platformCommentId: c.commentId || `gen_${Date.now()}_${Math.random().toString(36).slice(2)}`, text: c.text, nickname: c.nickname ?? null, likes: c.likes, createTime: c.createTime, isTop: c.isTop } }) } catch (e: unknown) { if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code !== 'P2002') throw e } }
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

export interface ListCommentsParams { page?: number; pageSize?: number; keyword?: string; sortBy?: 'likes' | 'createTime'; sortOrder?: 'asc' | 'desc'; sourceItemId?: string }
export interface CommentPageResult { items: Array<{ id: string; platformCommentId: string; text: string; nickname: string | null; likes: number; createTime: string; isTop: boolean; sourceItemTitle: string }>; total: number; page: number; pageSize: number }

export async function listCommentsForJob(userId: string, jobId: string, params: ListCommentsParams): Promise<CommentPageResult | null> {
  const job = await prisma.commentInsightJob.findFirst({ where: { id: jobId, userId } })
  if (!job) return null
  const page = params.page ?? 1; const pageSize = Math.min(params.pageSize ?? 50, 200)
  const where: Record<string, unknown> = { jobId }
  if (params.sourceItemId) where.sourceItemId = params.sourceItemId
  if (params.keyword) where.text = { contains: params.keyword }
  const orderBy: Record<string, string> = params.sortBy === 'likes' ? { likes: params.sortOrder === 'asc' ? 'asc' : 'desc' } : { createTime: params.sortOrder === 'asc' ? 'asc' : 'desc' }
  const [items, total] = await Promise.all([
    prisma.commentRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { sourceItem: { select: { title: true } } } }),
    prisma.commentRecord.count({ where }),
  ])
  return { items: items.map(r => ({ id: r.id, platformCommentId: r.platformCommentId, text: r.text, nickname: r.nickname, likes: r.likes, createTime: r.createTime, isTop: r.isTop, sourceItemTitle: r.sourceItem.title })), total, page, pageSize }
}

export async function exportJobCsv(userId: string, jobId: string): Promise<string | null> {
  const job = await prisma.commentInsightJob.findFirst({ where: { id: jobId, userId } })
  if (!job) return null
  const records = await prisma.commentRecord.findMany({ where: { jobId }, orderBy: { createdAt: 'desc' } })
  const { generateCsv } = await import('./csv')
  return generateCsv(records.map(r => ({ commentId: r.platformCommentId, text: r.text, nickname: r.nickname, likes: r.likes, createTime: r.createTime, isTop: r.isTop })))
}

export async function analyzeJobForUser(userId: string, jobId: string): Promise<SyncResult | null> {
  const j = await lj(userId, jobId); if (!j) return null
  const st = j.status as JobStatus
  if (st === 'analyzing') return toSR(j)
  if (st !== 'completed' && st !== 'partial') return null
  if (j.collectedCommentCount === 0) return toSR(j)
  await prisma.commentInsightJob.update({ where: { id: jobId }, data: { status: 'analyzing' } })
  try {
    const { analyzeComments } = await import('./analyzer')
    const records = await prisma.commentRecord.findMany({ where: { jobId }, orderBy: { likes: 'desc' }, take: 200 })
    const comments: Array<{ id: string; text: string; nickname: string | null; likes: number; isTop: boolean }> = records.map(r => ({ id: r.id, text: r.text, nickname: r.nickname, likes: r.likes, isTop: r.isTop }))
    const result = await analyzeComments(comments, j.collectedCommentCount, j.platform)
    await prisma.commentInsightJob.update({ where: { id: jobId }, data: { status: 'completed', analysisResult: result as unknown as Prisma.InputJsonValue, analyzedSampleCount: comments.length, completedAt: new Date() } })
    return toSR((await lj(userId, jobId))!)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '分析失败'
    await prisma.commentInsightJob.update({ where: { id: jobId }, data: { status: 'partial', errorMessage: msg } })
    return toSR((await lj(userId, jobId))!)
  }
}

import { fetchRedFoxComments } from '@/lib/redfox/comments'
import type { CommentRadarPlatform } from './types'
export interface CollectContext { jobId: string; sourceItemId: string; platform: CommentRadarPlatform; platformItemId: string; cursor: string; hasMore: boolean }
export interface CollectResult { cursor: string; hasMore: boolean; totalPagesProcessed: number; newCommentsCount: number; rateLimited: boolean; error: string | null }
export interface CollectOptions { maxPages?: number; persistPage: (jobId: string, sourceItemId: string, comments: Array<{ commentId: string; text: string; nickname?: string; likes: number; createTime: string; isTop: boolean }>, nextCursor: string | number, hasMore: boolean) => Promise<{ cursor: string; hasMore: boolean }>; existingCommentIds?: Set<string> }
function isRL(e: unknown): boolean { if (!(e instanceof Error)) return false; const m = e.message.toLowerCase(); return m.includes('rate') || m.includes('429') || m.includes('limit') }

/**
 * @description 收集sourceitempages
 * @param ctx - 上下文
 * @param opts - opts
 * @returns Promise<CollectResult>
 */
export async function collectSourceItemPages(ctx: CollectContext, opts: CollectOptions): Promise<CollectResult> {
  if (ctx.platform === 'wechat_channels') return collectWxChannelsPages(ctx, opts)
  const mx = opts.maxPages ?? 5; let cursor: string | number = ctx.cursor || ''; let hm = ctx.hasMore; let tp = 0, nc = 0
  const r: CollectResult = { cursor: ctx.cursor, hasMore: ctx.hasMore, totalPagesProcessed: 0, newCommentsCount: 0, rateLimited: false, error: null }
  for (let i = 0; i < mx && hm; i++) {
    try {
      const fo: { platform: 'douyin' | 'xiaohongshu'; itemId: string; cursorOrOffset?: number | string } = { platform: ctx.platform, itemId: ctx.platformItemId }
      if (cursor !== '') fo.cursorOrOffset = ctx.platform === 'douyin' ? Number(cursor) : String(cursor)
      const pg = await fetchRedFoxComments(fo)
      let cs = pg.items; if (opts.existingCommentIds?.size) cs = cs.filter(c => !opts.existingCommentIds!.has(c.commentId))
      const pr = await opts.persistPage(ctx.jobId, ctx.sourceItemId, cs, pg.nextCursor, pg.hasMore)
      cursor = pr.cursor; hm = pr.hasMore; tp++; nc += cs.length
    } catch (e) { if (isRL(e)) { r.rateLimited = true; break }; r.error = e instanceof Error ? e.message : String(e); break }
  }
  r.cursor = String(cursor); r.hasMore = hm; r.totalPagesProcessed = tp; r.newCommentsCount = nc; return r
}

/** 视频号评论采集：通过 TikHub WechatChannelsAdapter */
async function collectWxChannelsPages(ctx: CollectContext, opts: CollectOptions): Promise<CollectResult> {
  const { WechatChannelsAdapter } = await import('@/lib/tikhub/adapters')
  const wxAdapter = new WechatChannelsAdapter()
  const r: CollectResult = { cursor: ctx.cursor, hasMore: false, totalPagesProcessed: 0, newCommentsCount: 0, rateLimited: false, error: null }
  try {
    const comments = await wxAdapter.fetchComments(ctx.platformItemId, 50)
    let cs = comments.map(c => ({ commentId: c.commentId, text: c.text, nickname: undefined as string | undefined, likes: c.likes, createTime: String(c.createTime), isTop: c.isTop }))
    if (opts.existingCommentIds?.size) cs = cs.filter(c => !opts.existingCommentIds!.has(c.commentId))
    if (cs.length > 0) {
      await opts.persistPage(ctx.jobId, ctx.sourceItemId, cs, '', false)
    }
    r.totalPagesProcessed = 1; r.newCommentsCount = cs.length; r.hasMore = false
  } catch (e) { if (isRL(e)) { r.rateLimited = true } else { r.error = e instanceof Error ? e.message : String(e) } }
  return r
}

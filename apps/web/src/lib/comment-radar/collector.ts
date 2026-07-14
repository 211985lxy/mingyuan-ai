import { fetchRedFoxComments } from '@/lib/redfox/comments'
import type { CommentRadarPlatform } from './types'
export interface CollectContext { jobId: string; sourceItemId: string; platform: CommentRadarPlatform; platformItemId: string; cursor: string; hasMore: boolean }
export interface CollectResult { cursor: string; hasMore: boolean; totalPagesProcessed: number; newCommentsCount: number; rateLimited: boolean; error: string | null }
export interface CollectOptions { maxPages?: number; persistPage: (jobId: string, sourceItemId: string, comments: Array<{ commentId: string; text: string; nickname?: string; likes: number; createTime: string; isTop: boolean }>, nextCursor: string | number, hasMore: boolean) => Promise<{ cursor: string; hasMore: boolean }>; existingCommentIds?: Set<string> }
function isRL(e: unknown): boolean { if (!(e instanceof Error)) return false; const m = e.message.toLowerCase(); return m.includes('rate') || m.includes('429') || m.includes('limit') }
export async function collectSourceItemPages(ctx: CollectContext, opts: CollectOptions): Promise<CollectResult> {
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

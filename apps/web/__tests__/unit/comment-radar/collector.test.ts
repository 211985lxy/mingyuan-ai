import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/redfox/comments', () => ({ fetchRedFoxComments: vi.fn() }))
import { fetchRedFoxComments } from '@/lib/redfox/comments'
import { collectSourceItemPages } from '@/lib/comment-radar/collector'
import type { CollectResult } from '@/lib/comment-radar/collector'
const mock = vi.mocked(fetchRedFoxComments)
function mc(id: string) { return { commentId: id, text: `t-${id}`, likes: 0, createTime: '2024-01-01', isTop: false, nickname: `u-${id}` } }
describe('collector', () => {
  beforeEach(() => vi.clearAllMocks())
  it('persists every page before advancing cursor', async () => {
    mock.mockResolvedValueOnce({ items: [mc('c1'), mc('c2')], hasMore: true, nextCursor: 20 }).mockResolvedValueOnce({ items: [mc('c3')], hasMore: false, nextCursor: 40 })
    const ids: string[] = []
    await collectSourceItemPages({ jobId: 'j1', sourceItemId: 's1', platform: 'douyin', platformItemId: 'v1', cursor: '', hasMore: true }, { maxPages: 5, persistPage: async (_j, _s, c, nc, hm) => { ids.push(...c.map(x => x.commentId)); return { cursor: String(nc), hasMore: hm } } })
    expect(mock).toHaveBeenCalledTimes(2); expect(ids).toEqual(['c1', 'c2', 'c3'])
  })
  it('resumes from saved cursor', async () => {
    mock.mockResolvedValueOnce({ items: [mc('c3')], hasMore: true, nextCursor: 60 })
    await collectSourceItemPages({ jobId: 'j1', sourceItemId: 's1', platform: 'douyin', platformItemId: 'v1', cursor: '40', hasMore: true }, { maxPages: 5, persistPage: async (_j, _s, _c, nc, hm) => ({ cursor: String(nc), hasMore: hm }) })
    expect(mock).toHaveBeenCalledWith(expect.objectContaining({ cursorOrOffset: 40 }))
  })
  it('deduplicates via existingCommentIds', async () => {
    mock.mockResolvedValueOnce({ items: [mc('c1'), mc('c2')], hasMore: false, nextCursor: 20 })
    const seen = new Set<string>()
    await collectSourceItemPages({ jobId: 'j1', sourceItemId: 's1', platform: 'douyin', platformItemId: 'v1', cursor: '', hasMore: true }, { maxPages: 5, persistPage: async (_j, _s, c, nc, hm) => { c.forEach(x => seen.add(x.commentId)); return { cursor: String(nc), hasMore: hm } }, existingCommentIds: new Set(['c1']) })
    expect(seen).toEqual(new Set(['c2']))
  })
  it('processes at most 5 pages', async () => {
    for (let i = 0; i < 7; i++) mock.mockResolvedValueOnce({ items: [mc(`c${i}`)], hasMore: true, nextCursor: (i+1)*20 })
    let p = 0
    await collectSourceItemPages({ jobId: 'j1', sourceItemId: 's1', platform: 'douyin', platformItemId: 'v1', cursor: '', hasMore: true }, { maxPages: 5, persistPage: async () => { p++; return { cursor: '', hasMore: true } } })
    expect(p).toBe(5); expect(mock).toHaveBeenCalledTimes(5)
  })
  it('marks rate-limited', async () => {
    mock.mockRejectedValueOnce(new Error('RATE_LIMITED'))
    const r = await collectSourceItemPages({ jobId: 'j1', sourceItemId: 's1', platform: 'douyin', platformItemId: 'v1', cursor: '', hasMore: true }, { maxPages: 5, persistPage: async () => ({ cursor: '', hasMore: true }) })
    expect(r.rateLimited).toBe(true)
  })
  it('reports hasMore when more pages exist', async () => {
    mock.mockResolvedValueOnce({ items: [mc('c1')], hasMore: true, nextCursor: 20 })
    const r = await collectSourceItemPages({ jobId: 'j1', sourceItemId: 's1', platform: 'douyin', platformItemId: 'v1', cursor: '', hasMore: true }, { maxPages: 5, persistPage: async (_j, _s, _c, nc, hm) => ({ cursor: String(nc), hasMore: hm }) })
    expect(r.hasMore).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { resolveSource } from '@/lib/comment-radar/source-resolver'
describe('source-resolver', () => {
  it('recognizes a direct Douyin video URL', () => {
    const r = resolveSource('https://www.douyin.com/video/7234567890123456789')
    expect(r!.platform).toBe('douyin'); expect(r!.sourceType).toBe('video'); expect(r!.itemId).toBe('7234567890123456789'); expect(r!.videoLimit).toBe(1)
  })
  it('recognizes a Douyin short link', () => { const r = resolveSource('https://v.douyin.com/aBcDeFg/'); expect(r!.platform).toBe('douyin'); expect(r!.sourceType).toBe('unknown') })
  it('recognizes a Xiaohongshu note URL', () => { const r = resolveSource('https://www.xiaohongshu.com/explore/65abc1234567890def'); expect(r!.platform).toBe('xiaohongshu'); expect(r!.sourceType).toBe('video'); expect(r!.itemId).toBe('65abc1234567890def') })
  it('recognizes a Xiaohongshu short link', () => { const r = resolveSource('https://xhslink.com/a/shortlink123'); expect(r!.platform).toBe('xiaohongshu'); expect(r!.sourceType).toBe('unknown') })
  it('recognizes Douyin account URLs', () => { const r = resolveSource('https://www.douyin.com/user/MS4wLjABAAAA', 20); expect(r!.platform).toBe('douyin'); expect(r!.sourceType).toBe('account'); expect(r!.videoLimit).toBe(20) })
  it('recognizes Xiaohongshu account URLs', () => { const r = resolveSource('https://www.xiaohongshu.com/user/profile/abc123xyz', 10); expect(r!.platform).toBe('xiaohongshu'); expect(r!.sourceType).toBe('account') })
  it('rejects unsupported platforms', () => { expect(resolveSource('https://www.bilibili.com/video/BV1xx411c7mD')).toBeNull() })
  it('rejects empty or non-URL input', () => { expect(resolveSource('')).toBeNull(); expect(resolveSource('not a url')).toBeNull() })
  it('videoLimit defaults to 20 for account links', () => { const r = resolveSource('https://www.douyin.com/user/MS4wLjABAAAA'); expect(r!.sourceType).toBe('account'); expect(r!.videoLimit).toBe(20) })
})

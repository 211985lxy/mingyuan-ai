import { afterEach, describe, expect, it, vi } from 'vitest'
import { DouyinAdapter } from '@/lib/tikhub/adapters/douyin'

const mockEnv = vi.hoisted<Record<string, string | undefined>>(() => ({}))

vi.mock('@/env', () => ({ env: mockEnv }))

describe('DouyinAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mockEnv.TIKHUB_API_KEY = undefined
  })

  it('resolves sec_user_id when TikHub returns the id as a string', async () => {
    mockEnv.TIKHUB_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      message: 'ok',
      data: 'MS4wLjABAAAA_real_sec_user_id',
    }), { status: 200 })))

    const adapter = new DouyinAdapter({ localFallback: false })

    await expect(adapter.resolveUrl('https://v.douyin.com/example/'))
      .resolves.toBe('MS4wLjABAAAA_real_sec_user_id')
  })

  it('parses fetch_multi_video_statistics 的真实响应形状（statistics_list + 顶层计数）', async () => {
    mockEnv.TIKHUB_API_KEY = 'test-key'
    // 2026-09-11 用真实 key 调用 /api/v1/douyin/app/v3/fetch_multi_video_statistics
    // 抓到的原始形状：数组键为 statistics_list，计数直接放在条目顶层（无 statistics 嵌套）。
    // 旧代码读 aweme_details + item.statistics.*，配 ?? [] 导致静默遍历 0 次、统计永远为空。
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      message: 'ok',
      data: {
        statistics_list: [
          {
            aweme_id: '7642363455722229042',
            digg_count: 301085,
            play_count: 11634304,
            share_count: 10088,
            download_count: 1696,
          },
        ],
      },
    }), { status: 200 })))

    const adapter = new DouyinAdapter({ localFallback: false })
    const stats = await adapter.fetchVideoStats(['7642363455722229042'])

    expect(stats.get('7642363455722229042')).toEqual({
      views: 11634304,
      likes: 301085,
      comments: 0,
      shares: 10088,
      collects: 0,
    })
  })

  it('兼容旧响应形状（aweme_details + 嵌套 statistics）', async () => {
    mockEnv.TIKHUB_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      message: 'ok',
      data: {
        aweme_details: [
          {
            aweme_id: '111',
            statistics: { play_count: 10, digg_count: 2, comment_count: 1, share_count: 3, collect_count: 4 },
          },
        ],
      },
    }), { status: 200 })))

    const adapter = new DouyinAdapter({ localFallback: false })
    const stats = await adapter.fetchVideoStats(['111'])

    expect(stats.get('111')).toEqual({ views: 10, likes: 2, comments: 1, shares: 3, collects: 4 })
  })
})

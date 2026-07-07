import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFromExternalDouyinApi, hasExternalDouyinApi } from '@/lib/competitor-analysis/external-douyin-api'

const originalEnv = process.env

describe('external douyin api', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = originalEnv
  })

  it('detects whether the external API is configured', () => {
    delete process.env.COMPETITOR_DOUYIN_API_URL
    expect(hasExternalDouyinApi()).toBe(false)

    process.env.COMPETITOR_DOUYIN_API_URL = 'https://example.com/douyin'
    expect(hasExternalDouyinApi()).toBe(true)
  })

  it('normalizes a real external API response', async () => {
    process.env.COMPETITOR_DOUYIN_API_URL = 'https://example.com/douyin'
    process.env.COMPETITOR_DOUYIN_API_KEY = 'secret'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        platformUserId: 'sec_user_001',
        account: {
          nickname: 'Real Account',
          avatar: 'https://example.com/avatar.jpg',
          followerCount: 1000,
          videoCount: 1,
        },
        videos: [{
          videoId: 'video_001',
          title: '真实作品',
          coverUrl: 'https://example.com/cover.jpg',
          createTime: 1700000000,
          likes: 123,
          comments: 4,
          shares: 5,
          collects: 6,
        }],
        comments: [{
          commentId: 'comment_001',
          text: '真实评论',
          likes: 2,
          createTime: 1700000001,
        }],
      },
    }), { status: 200 }))

    const result = await fetchFromExternalDouyinApi({
      targetUrl: 'https://v.douyin.com/test/',
      platformUserId: null,
      count: 30,
    })

    expect(result.platformUserId).toBe('sec_user_001')
    expect(result.account.nickname).toBe('Real Account')
    expect(result.videos[0]?.videoId).toBe('video_001')
    expect(result.comments[0]?.text).toBe('真实评论')
    expect(fetch).toHaveBeenCalledWith('https://example.com/douyin', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }))
  })

  it('rejects empty video results instead of fabricating data', async () => {
    process.env.COMPETITOR_DOUYIN_API_URL = 'https://example.com/douyin'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      account: { nickname: 'No Video Account' },
      platformUserId: 'sec_user_001',
      videos: [],
    }), { status: 200 }))

    await expect(fetchFromExternalDouyinApi({
      targetUrl: 'https://v.douyin.com/test/',
      platformUserId: null,
      count: 30,
    })).rejects.toThrow('未返回任何作品')
  })
})

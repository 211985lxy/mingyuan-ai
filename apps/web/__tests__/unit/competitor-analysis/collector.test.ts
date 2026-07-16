import { describe, expect, it, vi } from 'vitest'
import { collectDouyinCompetitorData } from '@/lib/competitor-analysis/collector'
import { fetchFromRedFoxDouyinApi } from '@/lib/competitor-analysis/redfox-douyin-api'
import type {
  NormalizedAccount,
  NormalizedComment,
  NormalizedVideo,
  PlatformAdapter,
} from '@/lib/competitor-analysis/types'

function makeAccount(overrides: Partial<NormalizedAccount> = {}): NormalizedAccount {
  return {
    platformUserId: 'sec_user_001',
    nickname: 'Douyin Account',
    avatar: 'https://example.com/avatar.jpg',
    signature: 'bio',
    followerCount: 10000,
    followingCount: 12,
    totalLikes: 50000,
    videoCount: 3,
    isVerified: false,
    verifyInfo: '',
    ...overrides,
  }
}

function makeVideo(overrides: Partial<NormalizedVideo> = {}): NormalizedVideo {
  return {
    videoId: 'video_001',
    title: 'sample video',
    coverUrl: 'https://example.com/cover.jpg',
    videoUrl: 'https://example.com/video.mp4',
    createTime: 1700000000,
    duration: 30,
    views: 1000,
    likes: 100,
    comments: 10,
    shares: 5,
    collects: 20,
    ...overrides,
  }
}

function makeComment(overrides: Partial<NormalizedComment> = {}): NormalizedComment {
  return {
    commentId: 'comment_001',
    text: 'good',
    likes: 3,
    createTime: 1700000000,
    isTop: false,
    ...overrides,
  }
}

function makeAdapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    resolveUrl: vi.fn(async () => 'api_sec_user'),
    fetchAccount: vi.fn(async () => makeAccount({ platformUserId: 'api_sec_user' })),
    fetchVideos: vi.fn(async () => [makeVideo({ videoId: 'api_video_001' })]),
    fetchVideoStats: vi.fn(async () => new Map()),
    fetchComments: vi.fn(async () => [makeComment({ commentId: 'api_comment_001' })]),
    ...overrides,
  }
}

describe('collectDouyinCompetitorData', () => {
  it('uses the configured external API before local browser and TikHub', async () => {
    const apiAdapter = makeAdapter()
    const fetchFromLocalCrawler = vi.fn(async () => {
      throw new Error('local browser should not run')
    })
    const fetchFromExternalApi = vi.fn(async () => ({
      platformUserId: 'external_sec_user',
      account: makeAccount({ platformUserId: 'external_sec_user', nickname: 'External Account' }),
      videos: [makeVideo({ videoId: 'external_video_001' })],
      comments: [makeComment({ commentId: 'external_comment_001' })],
    }))

    const result = await collectDouyinCompetitorData(
      { targetUrl: 'https://www.douyin.com/user/external_sec_user', platformUserId: null, count: 50 },
      {
        fetchFromExternalApi,
        fetchFromLocalCrawler,
        apiAdapter,
        hasExternalApi: () => true,
        hasRedFoxApi: () => true,
        hasTikHubApiKey: () => true,
      },
    )

    expect(result.collectionSource).toBe('external_api')
    expect(result.fallbackUsed).toBe(false)
    expect(result.platformUserId).toBe('external_sec_user')
    expect(result.account.nickname).toBe('External Account')
    expect(fetchFromExternalApi).toHaveBeenCalledWith({
      targetUrl: 'https://www.douyin.com/user/external_sec_user',
      platformUserId: null,
      count: 50,
    })
    expect(fetchFromLocalCrawler).not.toHaveBeenCalled()
    expect(apiAdapter.fetchAccount).not.toHaveBeenCalled()
  })

  it('uses local browser data first and does not call the API adapter', async () => {
    const apiAdapter = makeAdapter()
    const fetchFromLocalCrawler = vi.fn(async () => ({
      account: makeAccount(),
      videos: [makeVideo()],
      comments: [makeComment()],
    }))

    const result = await collectDouyinCompetitorData(
      { targetUrl: 'https://www.douyin.com/user/sec_user_001', platformUserId: 'sec_user_001', count: 50 },
      {
        fetchFromLocalCrawler,
        apiAdapter,
        hasExternalApi: () => false,
        hasRedFoxApi: () => false,
        hasTikHubApiKey: () => false,
        hasLocalCrawler: () => true,
      },
    )

    expect(result.collectionSource).toBe('local_browser')
    expect(result.fallbackUsed).toBe(false)
    expect(result.platformUserId).toBe('sec_user_001')
    expect(result.videos).toHaveLength(1)
    expect(fetchFromLocalCrawler).toHaveBeenCalledWith('douyin', 'https://www.douyin.com/user/sec_user_001', 50)
    expect(apiAdapter.fetchAccount).not.toHaveBeenCalled()
    expect(apiAdapter.fetchVideos).not.toHaveBeenCalled()
  })

  it('uses RedFox before local browser and TikHub when configured', async () => {
    const apiAdapter = makeAdapter()
    const fetchFromLocalCrawler = vi.fn()
    const fetchFromRedFoxApi = vi.fn(async () => ({
      platformUserId: 'redfox_sec_user',
      account: makeAccount({ platformUserId: 'redfox_sec_user', nickname: 'RedFox Account' }),
      videos: [makeVideo({ videoId: 'redfox_video_001' })],
      comments: [],
    }))

    const result = await collectDouyinCompetitorData(
      { targetUrl: 'https://www.douyin.com/user/redfox_sec_user', platformUserId: null, count: 30 },
      {
        fetchFromRedFoxApi,
        fetchFromLocalCrawler,
        apiAdapter,
        hasExternalApi: () => false,
        hasRedFoxApi: () => true,
        hasTikHubApiKey: () => true,
        hasLocalCrawler: () => true,
      },
    )

    expect(result.collectionSource).toBe('redfox_api')
    expect(result.fallbackUsed).toBe(false)
    expect(result.account.nickname).toBe('RedFox Account')
    expect(fetchFromRedFoxApi).toHaveBeenCalledWith({
      targetUrl: 'https://www.douyin.com/user/redfox_sec_user',
      platformUserId: null,
      count: 30,
    })
    expect(fetchFromLocalCrawler).not.toHaveBeenCalled()
    expect(apiAdapter.fetchAccount).not.toHaveBeenCalled()
  })

  it('resolves a Douyin short link before calling RedFox', async () => {
    const apiAdapter = makeAdapter({
      resolveUrl: vi.fn(async () => 'MS4wLjABAAAAshort'),
    })
    const fetchFromRedFoxApi = vi.fn(async () => ({
      platformUserId: 'MS4wLjABAAAAshort',
      account: makeAccount({ platformUserId: 'MS4wLjABAAAAshort', nickname: 'Short Link Account' }),
      videos: [makeVideo({ videoId: 'redfox_short_video_001' })],
      comments: [],
    }))

    const result = await collectDouyinCompetitorData(
      { targetUrl: 'https://v.douyin.com/9CCtQ-z2ORg/', platformUserId: null, count: 30 },
      {
        fetchFromRedFoxApi,
        fetchFromLocalCrawler: vi.fn(),
        apiAdapter,
        hasExternalApi: () => false,
        hasRedFoxApi: () => true,
        hasTikHubApiKey: () => true,
        hasLocalCrawler: () => false,
      },
    )

    expect(result.collectionSource).toBe('redfox_api')
    expect(apiAdapter.resolveUrl).toHaveBeenCalledWith('https://v.douyin.com/9CCtQ-z2ORg/')
    expect(fetchFromRedFoxApi).toHaveBeenCalledWith({
      targetUrl: 'https://v.douyin.com/9CCtQ-z2ORg/',
      platformUserId: 'MS4wLjABAAAAshort',
      count: 30,
    })
  })

  it('falls back to TikHub when RedFox cannot resolve the Douyin profile URL', async () => {
    const apiAdapter = makeAdapter({
      fetchVideoStats: vi.fn(async () => new Map([
        ['api_video_001', { views: 3000, likes: 300, comments: 30, shares: 12, collects: 50 }],
      ])),
    })
    const fetchFromRedFoxApi = vi.fn(async () => {
      throw new Error('接口执行异常，积分未扣除: 无法从作者主页地址中提取sec_user_id')
    })

    const result = await collectDouyinCompetitorData(
      { targetUrl: 'https://www.douyin.com/user/MS4wLjABAAAAabc', platformUserId: null, count: 30 },
      {
        fetchFromRedFoxApi,
        fetchFromLocalCrawler: vi.fn(),
        apiAdapter,
        hasExternalApi: () => false,
        hasRedFoxApi: () => true,
        hasTikHubApiKey: () => true,
        hasLocalCrawler: () => false,
      },
    )

    expect(result.collectionSource).toBe('tikhub_api')
    expect(result.fallbackUsed).toBe(true)
    expect(result.fallbackReason).toContain('无法从作者主页地址中提取sec_user_id')
    expect(result.platformUserId).toBe('api_sec_user')
    expect(result.videos[0]?.views).toBe(3000)
  })

  it('uses the API adapter only after cheaper providers are unavailable', async () => {
    const apiAdapter = makeAdapter({
      fetchVideoStats: vi.fn(async () => new Map([
        ['api_video_001', { views: 2000, likes: 200, comments: 20, shares: 10, collects: 40 }],
      ])),
    })
    const fetchFromLocalCrawler = vi.fn()

    const result = await collectDouyinCompetitorData(
      { targetUrl: 'https://www.douyin.com/user/api_sec_user', platformUserId: 'api_sec_user', count: 50 },
      {
        fetchFromLocalCrawler,
        apiAdapter,
        hasExternalApi: () => false,
        hasRedFoxApi: () => false,
        hasLocalCrawler: () => false,
        hasTikHubApiKey: () => true,
      },
    )

    expect(result.collectionSource).toBe('tikhub_api')
    expect(result.fallbackUsed).toBe(false)
    expect(result.fallbackReason).toBeNull()
    expect(result.account.platformUserId).toBe('api_sec_user')
    expect(result.videos[0]?.views).toBe(2000)
    expect(result.comments[0]?.commentId).toBe('api_comment_001')
    expect(fetchFromLocalCrawler).not.toHaveBeenCalled()
  })

  it('surfaces the local browser error when explicitly enabled and no API fallback is configured', async () => {
    const fetchFromLocalCrawler = vi.fn(async () => {
      throw new Error('local browser failed')
    })

    await expect(collectDouyinCompetitorData(
      { targetUrl: 'https://www.douyin.com/user/sec_user_001', platformUserId: 'sec_user_001', count: 50 },
      {
        fetchFromLocalCrawler,
        apiAdapter: makeAdapter(),
        hasExternalApi: () => false,
        hasRedFoxApi: () => false,
        hasTikHubApiKey: () => false,
        hasLocalCrawler: () => true,
      },
    )).rejects.toThrow('local browser failed')
  })

  it('fails fast when no real collection provider is configured', async () => {
    await expect(collectDouyinCompetitorData(
      { targetUrl: 'https://www.douyin.com/user/sec_user_001', platformUserId: 'sec_user_001', count: 50 },
      {
        fetchFromLocalCrawler: vi.fn(),
        apiAdapter: makeAdapter(),
        hasExternalApi: () => false,
        hasRedFoxApi: () => false,
        hasTikHubApiKey: () => false,
        hasLocalCrawler: () => false,
      },
    )).rejects.toThrow('未配置真实对标账号抓取服务')
  })
})

describe('fetchFromRedFoxDouyinApi', () => {
  it('normalizes RedFox account and work-list data without calling TikHub', async () => {
    vi.stubEnv('REDFOX_API_KEY', 'rk_test_123')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/story/api/dyData/queryWorkList')) {
        return Response.json({
          code: 2000,
          msg: '成功',
          data: {
            hasMore: false,
            list: [{
              workId: '7388888888888888888',
              title: '爆款标题',
              workUrl: 'https://www.douyin.com/video/7388888888888888888',
              coverUrl: 'https://example.com/cover.jpg',
              duration: 60,
              publishTime: '2026-05-20 10:00:00',
              commentCount: 280,
              shareCount: 150,
              likeCount: 8000,
              collectCount: 500,
              authorId: 'dy_user123',
              secUid: 'MS4wLjABAAAAtest',
              accountName: 'RedFox 用户',
              avatarUrl: 'https://example.com/avatar.jpg',
              followerCount: 100000,
            }],
          },
        })
      }
      return Response.json({
        code: 2000,
        msg: '成功',
        data: {
          nickname: 'RedFox 用户',
          avatarUrl: 'https://example.com/avatar.jpg',
          signature: '简介',
          uid: '1234567890',
          followerCount: 100000,
          awemeCount: 200,
          totalFavorited: 5000000,
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchFromRedFoxDouyinApi({
      targetUrl: 'https://www.douyin.com/user/MS4wLjABAAAAtest',
      platformUserId: null,
      count: 30,
    })

    expect(result.platformUserId).toBe('MS4wLjABAAAAtest')
    expect(result.account.nickname).toBe('RedFox 用户')
    expect(result.account.totalLikes).toBe(5000000)
    expect(result.videos[0]).toMatchObject({
      videoId: '7388888888888888888',
      title: '爆款标题',
      likes: 8000,
      comments: 280,
      shares: 150,
      collects: 500,
    })
    expect(result.comments).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      authorUrl: 'https://www.douyin.com/user/MS4wLjABAAAAtest',
      secUserId: 'MS4wLjABAAAAtest',
      offset: 0,
      sortType: '_2',
    })
  })

  it('sends a RedFox accountId instead of secUserId when the profile path is a Douyin account name', async () => {
    vi.stubEnv('REDFOX_API_KEY', 'rk_test_123')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/story/api/dyData/queryWorkList')) {
        return Response.json({
          code: 2000,
          msg: '成功',
          data: {
            hasMore: false,
            list: [{
              workId: '7388888888888888888',
              title: '账号作品',
              workUrl: 'https://www.douyin.com/video/7388888888888888888',
              authorId: 'nxpt260212',
              accountName: 'RedFox 用户',
            }],
          },
        })
      }
      return Response.json({
        code: 2000,
        msg: '成功',
        data: {
          nickname: 'RedFox 用户',
          uid: 'nxpt260212',
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchFromRedFoxDouyinApi({
      targetUrl: 'https://www.douyin.com/user/nxpt260212',
      platformUserId: null,
      count: 30,
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.accountId).toBe('nxpt260212')
    expect(body.secUserId).toBeUndefined()
  })
})

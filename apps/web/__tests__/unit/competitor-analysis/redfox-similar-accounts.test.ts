import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverDouyinSimilarAccounts } from '@/lib/competitor-analysis/redfox-similar-accounts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('discoverDouyinSimilarAccounts', () => {
  it('normalizes current, peer and leader accounts', async () => {
    vi.stubEnv('REDFOX_API_KEY', 'ak_test')
    const fetchMock = vi.fn(async () => Response.json({
      code: 2000,
      msg: '成功',
      data: {
        currentAccount: {
          nickname: '当前账号',
          avatarUrl: 'https://example.com/a.jpg',
          secUid: 'MS4current',
          followerCount: 10000,
          redfoxIndex: 700.5,
          works: [{
            title: '近期作品',
            workUrl: 'https://www.douyin.com/video/1',
            diggCount: 100,
            commentCount: 5,
          }],
        },
        benchmarkAccounts: [{
          nickname: '近身对标',
          url: 'https://www.douyin.com/user/MS4peer',
          secUid: 'MS4peer',
          followerCount: 20000,
          redfoxIndex: 720,
          reason: '红狐指数接近',
          works: [{
            desc: '对标作品\n第二行',
            workUrl: 'https://www.douyin.com/video/2',
            diggCount: 200,
            commentCount: 10,
            shareCount: 3,
            playCount: 1000,
            interactiveCount: 213,
          }],
        }],
        topAccounts: [{
          nickname: '头部标杆',
          uid: 'leader_uid',
          followerCount: 30000,
        }],
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await discoverDouyinSimilarAccounts({ accountId: 'seed_id' })

    expect(result.currentAccount?.targetUrl).toBe('https://www.douyin.com/user/MS4current')
    expect(result.currentAccount?.recentVideos[0]?.title).toBe('近期作品')
    expect(result.peerAccounts[0]).toMatchObject({
      nickname: '近身对标',
      targetUrl: 'https://www.douyin.com/user/MS4peer',
      followerCount: 20000,
      redfoxScore: 720,
      reason: '红狐指数接近',
    })
    expect(result.peerAccounts[0]?.recentVideos[0]).toMatchObject({
      title: '对标作品',
      likes: 200,
      comments: 10,
      views: 1000,
      interactiveCount: 213,
    })
    expect(result.leaderAccounts[0]?.targetUrl).toBe('https://www.douyin.com/user/leader_uid')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('returns empty groups when RedFox has no recommendations', async () => {
    vi.stubEnv('REDFOX_API_KEY', 'ak_test')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      code: 2000,
      data: { currentAccount: null, benchmarkAccounts: [], topAccounts: [] },
    })))

    const result = await discoverDouyinSimilarAccounts({ accountId: 'seed_id' })

    expect(result.currentAccount).toBeNull()
    expect(result.peerAccounts).toEqual([])
    expect(result.leaderAccounts).toEqual([])
  })

  it('surfaces RedFox business errors', async () => {
    vi.stubEnv('REDFOX_API_KEY', 'ak_test')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      code: 4001,
      msg: '未找到账号',
    })))

    await expect(discoverDouyinSimilarAccounts({ accountId: 'missing' })).rejects.toThrow('未找到账号')
  })

  it('fails clearly when REDFOX_API_KEY is missing', async () => {
    vi.stubEnv('REDFOX_API_KEY', '')

    await expect(discoverDouyinSimilarAccounts({ accountId: 'seed_id' })).rejects.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { calculateMetrics } from '@/lib/competitor-analysis/metrics'
import type { NormalizedAccount, NormalizedVideo } from '@/lib/competitor-analysis/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<NormalizedAccount> = {}): NormalizedAccount {
  return {
    platformUserId: 'user_001',
    nickname: 'TestUser',
    avatar: 'https://example.com/avatar.jpg',
    signature: 'Test bio',
    followerCount: 10000,
    followingCount: 100,
    totalLikes: 50000,
    videoCount: 20,
    isVerified: false,
    verifyInfo: '',
    ...overrides,
  }
}

function makeVideo(overrides: Partial<NormalizedVideo> = {}): NormalizedVideo {
  return {
    videoId: 'vid_001',
    title: 'Test video',
    coverUrl: 'https://example.com/cover.jpg',
    videoUrl: 'https://example.com/video.mp4',
    createTime: 1700000000, // ~Nov 2023
    duration: 30,
    views: 1000,
    likes: 100,
    comments: 10,
    shares: 5,
    collects: 20,
    ...overrides,
  }
}

// Wednesday 14:00 local (UTC+8): 2023-11-08 06:00:00 UTC = Unix 1699423200
const WED_14_TIMESTAMP = 1699423200
// Monday 09:00 local (UTC+8): 2023-11-06 01:00:00 UTC = Unix 1699232400
const MON_09_TIMESTAMP = 1699232400

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('calculateMetrics — empty videos', () => {
  it('returns all-zero engagement fields when videos=[]', () => {
    const result = calculateMetrics(makeAccount(), [])
    expect(result.engagement.avg_likes).toBe(0)
    expect(result.engagement.avg_comments).toBe(0)
    expect(result.engagement.avg_shares).toBe(0)
    expect(result.engagement.avg_collects).toBe(0)
    expect(result.engagement.avg_views).toBe(0)
    expect(result.engagement.weighted_engagement_rate).toBe(0)
    expect(result.engagement.like_to_comment_ratio).toBe(0)
  })

  it('returns total_videos=0 and consistency_score=50 when videos=[]', () => {
    const result = calculateMetrics(makeAccount(), [])
    expect(result.publishing.total_videos).toBe(0)
    expect(result.publishing.consistency_score).toBe(50)
  })

  it('returns empty top_hashtags when videos=[]', () => {
    const result = calculateMetrics(makeAccount(), [])
    expect(result.content.top_hashtags).toEqual([])
  })

  it('returns all-zero duration_distribution when videos=[]', () => {
    const result = calculateMetrics(makeAccount(), [])
    expect(result.content.duration_distribution).toEqual({
      '<15s': 0,
      '15-60s': 0,
      '1-3min': 0,
      '3-5min': 0,
      '>5min': 0,
    })
  })
})

describe('calculateMetrics — weighted_engagement_rate', () => {
  it('calculates correct weighted engagement rate', () => {
    // views=1000, likes=100, comments=10, shares=5, collects=20
    // (100*0.5 + 10*2 + 5*4 + 20*3) / 1000 * 100
    // = (50 + 20 + 20 + 60) / 1000 * 100
    // = 150/1000 * 100 = 15.0
    const video = makeVideo({ views: 1000, likes: 100, comments: 10, shares: 5, collects: 20 })
    const result = calculateMetrics(makeAccount(), [video])
    expect(result.engagement.weighted_engagement_rate).toBeCloseTo(15.0, 1)
  })
})

describe('calculateMetrics — duration bucketing', () => {
  it('buckets durations correctly across all 5 ranges', () => {
    const videos = [
      makeVideo({ videoId: 'v1', duration: 10 }),   // <15s
      makeVideo({ videoId: 'v2', duration: 30 }),   // 15-60s
      makeVideo({ videoId: 'v3', duration: 120 }),  // 1-3min
      makeVideo({ videoId: 'v4', duration: 240 }),  // 3-5min
      makeVideo({ videoId: 'v5', duration: 400 }),  // >5min
    ]
    const result = calculateMetrics(makeAccount(), videos)
    expect(result.content.duration_distribution['<15s']).toBe(1)
    expect(result.content.duration_distribution['15-60s']).toBe(1)
    expect(result.content.duration_distribution['1-3min']).toBe(1)
    expect(result.content.duration_distribution['3-5min']).toBe(1)
    expect(result.content.duration_distribution['>5min']).toBe(1)
  })
})

describe('calculateMetrics — viral_ratio', () => {
  it('calculates viral_ratio = 1/5 when only the highest-view video passes 2x average threshold', () => {
    // views=[100,100,100,100,1000], avg=280, threshold=560
    // Only 1000 > 560 → viral_ratio=0.2
    const videos = [
      makeVideo({ videoId: 'v1', views: 100 }),
      makeVideo({ videoId: 'v2', views: 100 }),
      makeVideo({ videoId: 'v3', views: 100 }),
      makeVideo({ videoId: 'v4', views: 100 }),
      makeVideo({ videoId: 'v5', views: 1000 }),
    ]
    const result = calculateMetrics(makeAccount(), videos)
    expect(result.content.viral_ratio).toBeCloseTo(0.2, 5)
  })
})

describe('calculateMetrics — consistency_score', () => {
  it('returns consistency_score=100 when all weeks have the same count', () => {
    // 4 weeks × 2 videos per week — stddev=0 → score=100
    // Week 1: Nov 6 (Mon) + Nov 7 (Tue)
    // Week 2: Nov 13 (Mon) + Nov 14 (Tue)
    // Week 3: Nov 20 (Mon) + Nov 21 (Tue)
    // Week 4: Nov 27 (Mon) + Nov 28 (Tue)
    const week1Mon = 1699264800 // 2023-11-06 09:00 UTC
    const videos = [
      makeVideo({ videoId: 'v1', createTime: week1Mon }),
      makeVideo({ videoId: 'v2', createTime: week1Mon + 86400 }),
      makeVideo({ videoId: 'v3', createTime: week1Mon + 7 * 86400 }),
      makeVideo({ videoId: 'v4', createTime: week1Mon + 8 * 86400 }),
      makeVideo({ videoId: 'v5', createTime: week1Mon + 14 * 86400 }),
      makeVideo({ videoId: 'v6', createTime: week1Mon + 15 * 86400 }),
      makeVideo({ videoId: 'v7', createTime: week1Mon + 21 * 86400 }),
      makeVideo({ videoId: 'v8', createTime: week1Mon + 22 * 86400 }),
    ]
    const result = calculateMetrics(makeAccount(), videos)
    expect(result.publishing.consistency_score).toBe(100)
  })
})

describe('calculateMetrics — top_hashtags', () => {
  it('returns top_hashtags sorted by count desc, merging across videos', () => {
    const videos = [
      makeVideo({ videoId: 'v1', title: '#美食 #探店 好吃的' }),
      makeVideo({ videoId: 'v2', title: '#美食 #穿搭 今天穿什么' }),
    ]
    const result = calculateMetrics(makeAccount(), videos)
    expect(result.content.top_hashtags[0]).toEqual({ tag: '#美食', count: 2 })
  })
})

describe('calculateMetrics — most_active_day and most_active_hour', () => {
  it('returns correct most_active_day and most_active_hour', () => {
    // 3 videos on Wednesday at 14:00, 1 on Monday at 09:00
    const videos = [
      makeVideo({ videoId: 'v1', createTime: WED_14_TIMESTAMP }),
      makeVideo({ videoId: 'v2', createTime: WED_14_TIMESTAMP + 60 }), // same Wed-14 bucket
      makeVideo({ videoId: 'v3', createTime: WED_14_TIMESTAMP + 120 }), // same Wed-14 bucket
      makeVideo({ videoId: 'v4', createTime: MON_09_TIMESTAMP }),
    ]
    const result = calculateMetrics(makeAccount(), videos)
    expect(result.publishing.most_active_day).toBe('Wed')
    expect(result.publishing.most_active_hour).toBe(14)
  })
})

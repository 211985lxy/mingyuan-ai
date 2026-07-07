import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedAccount, NormalizedVideo, NormalizedComment, CompetitorMetrics, CompetitorAnalysisResult } from '@/lib/competitor-analysis/types'

// ── Mock LLMClient ────────────────────────────────────────────────────────────

const mockComplete = vi.fn()

vi.mock('@/lib/llm', () => ({
  LLMClient: {
    shared: () => ({ complete: mockComplete }),
  },
}))

// Import AFTER mock is set up
const { analyzeCompetitor } = await import('@/lib/competitor-analysis/analyzer')

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
    // Wednesday 14:00 local (UTC+8): 2023-11-08 06:00:00 UTC
    createTime: 1699423200,
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
    commentId: 'c_001',
    text: 'Great video!',
    likes: 5,
    createTime: 1699423200,
    isTop: false,
    ...overrides,
  }
}

function makeMetrics(): CompetitorMetrics {
  return {
    engagement: {
      avg_likes: 100,
      avg_comments: 10,
      avg_shares: 5,
      avg_collects: 20,
      avg_views: 1000,
      weighted_engagement_rate: 15.0,
      like_to_comment_ratio: 10.0,
    },
    publishing: {
      total_videos: 1,
      avg_per_week: 2.5,
      avg_per_month: 10.0,
      most_active_day: 'Wed',
      most_active_hour: 14,
      consistency_score: 75,
    },
    content: {
      avg_duration_seconds: 30,
      duration_distribution: { '<15s': 0, '15-60s': 1, '1-3min': 0, '3-5min': 0, '>5min': 0 },
      viral_ratio: 0.0,
      top_hashtags: [],
    },
  }
}

/** Build a minimal valid CompetitorAnalysisResult for LLM mock responses */
function makeAnalysisResult(scoreOverrides: Partial<CompetitorAnalysisResult['scores']> = {}): CompetitorAnalysisResult {
  return {
    scores: {
      content_power: 75,
      growth_power: 70,
      engagement_power: 80,
      monetization_power: 60,
      persona_power: 65,
      operation_power: 72,
      overall: 72,
      ...scoreOverrides,
    },
    sections: {
      account_overview: {
        account_type: '生活分享',
        content_vertical: '美食',
        positioning: '平民美食探店',
        differentiator: '真实接地气',
      },
      content_strategy: {
        topic_distribution: [{ topic: '探店', percentage: 60 }],
        content_formats: [{ format: '竖屏短视频', percentage: 100 }],
        hook_patterns: ['提问开头', '悬念标题'],
        posting_frequency: '每周3-4条',
        best_posting_times: '18:00-21:00',
        viral_formula: '情绪共鸣 + 实用信息',
      },
      growth_analysis: {
        growth_trend: '稳定增长',
        growth_drivers: ['高频发布', '爆款内容'],
        follower_quality: '高活跃度',
      },
      engagement_analysis: {
        avg_engagement_rate: 15.0,
        avg_likes: 100,
        avg_comments: 10,
        avg_shares: 5,
        comment_quality: '正向互动为主',
        anomaly_detection: '无异常',
      },
      monetization_analysis: {
        monetization_paths: ['品牌合作'],
        product_categories: ['餐饮'],
        estimated_revenue_level: '中等',
      },
      recommendations: {
        reusable_strategies: ['高频发布策略'],
        differentiation_points: ['更专业的内容'],
        action_plan_30d: ['每日发布1条'],
        risks: ['内容同质化'],
      },
    },
    stats: {
      total_videos_analyzed: 1,
      date_range: { from: '2023-11-08', to: '2023-11-08' },
      top_videos: [],
      posting_heatmap: {},
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('analyzeCompetitor — prompt structure', () => {
  beforeEach(() => {
    mockComplete.mockClear()
    mockComplete.mockResolvedValue({
      content: JSON.stringify(makeAnalysisResult()),
      model: 'claude-3-5-sonnet-20241022',
      provider: 'therouter',
    })
  })

  it('calls LLMClient with temperature=0.3, maxTokens=3500, responseFormat json_object', async () => {
    await analyzeCompetitor(makeAccount(), [makeVideo()], [makeComment()], makeMetrics())
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        maxTokens: 3500,
        responseFormat: { type: 'json_object' },
      }),
    )
  })

  it('passes system message with role=system containing "竞品分析报告" and "6维"', async () => {
    await analyzeCompetitor(makeAccount(), [makeVideo()], [makeComment()], makeMetrics())
    const options = mockComplete.mock.calls[0][0]
    const systemMsg = options.messages[0]
    expect(systemMsg.role).toBe('system')
    expect(systemMsg.content).toContain('竞品分析报告')
    expect(systemMsg.content).toContain('6维')
  })

  it('passes user message with role=user containing account nickname', async () => {
    const account = makeAccount({ nickname: 'UniqueNickname_XYZ' })
    await analyzeCompetitor(account, [makeVideo()], [makeComment()], makeMetrics())
    const options = mockComplete.mock.calls[0][0]
    const userMsg = options.messages[1]
    expect(userMsg.role).toBe('user')
    expect(userMsg.content).toContain('UniqueNickname_XYZ')
  })
})

describe('analyzeCompetitor — JSON strip', () => {
  it('strips markdown code fences and parses JSON correctly', async () => {
    const resultJson = JSON.stringify(makeAnalysisResult())
    mockComplete.mockResolvedValue({
      content: `\`\`\`json\n${resultJson}\n\`\`\``,
      model: 'claude-3-5-sonnet-20241022',
      provider: 'therouter',
    })
    const result = await analyzeCompetitor(makeAccount(), [makeVideo()], [makeComment()], makeMetrics())
    expect(result.scores.content_power).toBe(75)
  })
})

describe('analyzeCompetitor — score clamping', () => {
  it('clamps overall score above 100 to 100', async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify(makeAnalysisResult({ overall: 150 })),
      model: 'claude-3-5-sonnet-20241022',
      provider: 'therouter',
    })
    const result = await analyzeCompetitor(makeAccount(), [makeVideo()], [makeComment()], makeMetrics())
    expect(result.scores.overall).toBe(100)
  })

  it('clamps overall score below 0 to 0', async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify(makeAnalysisResult({ overall: -5 })),
      model: 'claude-3-5-sonnet-20241022',
      provider: 'therouter',
    })
    const result = await analyzeCompetitor(makeAccount(), [makeVideo()], [makeComment()], makeMetrics())
    expect(result.scores.overall).toBe(0)
  })
})

describe('analyzeCompetitor — posting_heatmap', () => {
  it('builds posting_heatmap from video createTime values', async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify(makeAnalysisResult()),
      model: 'claude-3-5-sonnet-20241022',
      provider: 'therouter',
    })
    // Wednesday 14:00 local: 1699423200
    const video = makeVideo({ createTime: 1699423200 })
    const result = await analyzeCompetitor(makeAccount(), [video], [makeComment()], makeMetrics())
    // Heatmap key format: "Day-HH" (zero-padded)
    expect(result.stats.posting_heatmap['Wed-14']).toBe(1)
  })
})

describe('analyzeCompetitor — top videos', () => {
  it('does not copy likes into views when play count is unavailable', async () => {
    mockComplete.mockResolvedValue({
      content: JSON.stringify(makeAnalysisResult()),
      model: 'claude-3-5-sonnet-20241022',
      provider: 'therouter',
    })

    const result = await analyzeCompetitor(makeAccount(), [makeVideo({ views: 0, likes: 115000 })], [], makeMetrics())

    expect(result.stats.top_videos[0].views).toBe(0)
    expect(result.stats.top_videos[0].likes).toBe(115000)
  })
})

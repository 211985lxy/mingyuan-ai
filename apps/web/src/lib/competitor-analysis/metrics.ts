import type { NormalizedAccount, NormalizedVideo, CompetitorMetrics } from './types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function stddev(arr: number[]): number {
  const m = avg(arr)
  return Math.sqrt(avg(arr.map(x => (x - m) ** 2)))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function groupByWeek(videos: NormalizedVideo[]): Record<string, NormalizedVideo[]> {
  const buckets: Record<string, NormalizedVideo[]> = {}
  for (const v of videos) {
    const d = new Date(v.createTime * 1000)
    const jan1 = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(
      ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
    )
    const key = `${d.getFullYear()}-${String(weekNum).padStart(2, '0')}`
    buckets[key] = [...(buckets[key] ?? []), v]
  }
  return buckets
}

// ── Public API ────────────────────────────────────────────────────────────────

export function calculateMetrics(
  account: NormalizedAccount,
  videos: NormalizedVideo[],
): CompetitorMetrics {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

  // Empty-videos fast path
  if (videos.length === 0) {
    return {
      engagement: {
        avg_likes: 0,
        avg_comments: 0,
        avg_shares: 0,
        avg_collects: 0,
        avg_views: 0,
        weighted_engagement_rate: 0,
        like_to_comment_ratio: 0,
      },
      publishing: {
        total_videos: 0,
        avg_per_week: 0,
        avg_per_month: 0,
        most_active_day: 'Mon',
        most_active_hour: 12,
        consistency_score: 50,
      },
      content: {
        avg_duration_seconds: 0,
        duration_distribution: { '<15s': 0, '15-60s': 0, '1-3min': 0, '3-5min': 0, '>5min': 0 },
        viral_ratio: 0,
        top_hashtags: [],
      },
    }
  }

  const totalVideos = videos.length

  // ── Engagement averages ───────────────────────────────────────────────────
  const avgLikes = Math.round(avg(videos.map(v => v.likes)))
  const avgComments = Math.round(avg(videos.map(v => v.comments)))
  const avgShares = Math.round(avg(videos.map(v => v.shares)))
  const avgCollects = Math.round(avg(videos.map(v => v.collects)))
  const avgViews = Math.round(avg(videos.map(v => v.views)))

  // Engagement rate: prefer views as denominator, fall back to follower count
  // (Douyin no longer returns play_count publicly, so views may be 0)
  const engagementDenominator = avgViews > 0 ? avgViews : (account.followerCount || 1)
  const weightedEngagementRate =
    round2((avgLikes * 0.5 + avgComments * 2 + avgShares * 4 + avgCollects * 3) / engagementDenominator * 100)

  const likeToCommentRatio =
    avgComments === 0 ? 0 : round2(avgLikes / avgComments)

  // ── Publishing frequency ──────────────────────────────────────────────────
  const sorted = [...videos].sort((a, b) => a.createTime - b.createTime)
  const firstTime = sorted[0].createTime
  const lastTime = sorted[sorted.length - 1].createTime
  const daySpan = Math.max(1, (lastTime - firstTime) / 86400)
  const avgPerWeek = round2((totalVideos / daySpan) * 7)
  const avgPerMonth = round2((totalVideos / daySpan) * 30)

  // ── Hour/day distribution ─────────────────────────────────────────────────
  const dayCounts: Record<string, number> = {}
  const hourCounts: Record<string, number> = {}

  for (const v of videos) {
    const d = new Date(v.createTime * 1000)
    const dayKey = DAYS[d.getDay()]
    const hourKey = String(d.getHours())
    dayCounts[dayKey] = (dayCounts[dayKey] ?? 0) + 1
    hourCounts[hourKey] = (hourCounts[hourKey] ?? 0) + 1
  }

  const topDayEntry = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]
  const topHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]

  const mostActiveDay = topDayEntry ? topDayEntry[0] : 'Mon'
  const mostActiveHour = topHourEntry ? Number(topHourEntry[0]) : 12

  // ── Consistency score ─────────────────────────────────────────────────────
  const weekBuckets = groupByWeek(videos)
  const weeklyPostCounts = Object.values(weekBuckets).map(v => v.length)

  let consistencyScore: number
  if (weeklyPostCounts.length <= 1) {
    consistencyScore = 50
  } else {
    const weekAvg = avg(weeklyPostCounts)
    const weekStddev = stddev(weeklyPostCounts)
    consistencyScore = Math.round(
      Math.max(0, 100 - (weekStddev / Math.max(1, weekAvg)) * 100),
    )
  }

  // ── Content metrics ───────────────────────────────────────────────────────
  const avgDurationSeconds = Math.round(avg(videos.map(v => v.duration)))

  const durationDistribution: Record<string, number> = {
    '<15s': 0,
    '15-60s': 0,
    '1-3min': 0,
    '3-5min': 0,
    '>5min': 0,
  }
  for (const v of videos) {
    if (v.duration < 15) {
      durationDistribution['<15s']++
    } else if (v.duration < 60) {
      durationDistribution['15-60s']++
    } else if (v.duration < 180) {
      durationDistribution['1-3min']++
    } else if (v.duration < 300) {
      durationDistribution['3-5min']++
    } else {
      durationDistribution['>5min']++
    }
  }

  // ── Viral ratio ───────────────────────────────────────────────────────────
  const avgViewsRaw = avg(videos.map(v => v.views))
  const viewThreshold = avgViewsRaw * 2
  const viralCount = videos.filter(v => v.views > viewThreshold).length
  const viralRatio = round2(viralCount / totalVideos)

  // ── Top hashtags ──────────────────────────────────────────────────────────
  const tagCounts: Record<string, number> = {}
  const hashtagRegex = /#[\w\u4e00-\u9fff]+/g
  for (const v of videos) {
    const matches = v.title.match(hashtagRegex) ?? []
    for (const tag of matches) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    }
  }
  const topHashtags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))

  return {
    engagement: {
      avg_likes: avgLikes,
      avg_comments: avgComments,
      avg_shares: avgShares,
      avg_collects: avgCollects,
      avg_views: avgViews,
      weighted_engagement_rate: weightedEngagementRate,
      like_to_comment_ratio: likeToCommentRatio,
    },
    publishing: {
      total_videos: totalVideos,
      avg_per_week: avgPerWeek,
      avg_per_month: avgPerMonth,
      most_active_day: mostActiveDay,
      most_active_hour: mostActiveHour,
      consistency_score: consistencyScore,
    },
    content: {
      avg_duration_seconds: avgDurationSeconds,
      duration_distribution: durationDistribution,
      viral_ratio: viralRatio,
      top_hashtags: topHashtags,
    },
  }
}

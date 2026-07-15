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

function emptyMetrics(): CompetitorMetrics {
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

function calculateEngagement(
  account: NormalizedAccount,
  videos: NormalizedVideo[],
): CompetitorMetrics['engagement'] {
  const avgLikes = Math.round(avg(videos.map(v => v.likes)))
  const avgComments = Math.round(avg(videos.map(v => v.comments)))
  const avgShares = Math.round(avg(videos.map(v => v.shares)))
  const avgCollects = Math.round(avg(videos.map(v => v.collects)))
  const avgViews = Math.round(avg(videos.map(v => v.views)))
  const engagementDenominator = avgViews > 0 ? avgViews : (account.followerCount || 1)
  const weightedEngagementRate =
    round2((avgLikes * 0.5 + avgComments * 2 + avgShares * 4 + avgCollects * 3) / engagementDenominator * 100)
  return {
    avg_likes: avgLikes,
    avg_comments: avgComments,
    avg_shares: avgShares,
    avg_collects: avgCollects,
    avg_views: avgViews,
    weighted_engagement_rate: weightedEngagementRate,
    like_to_comment_ratio: avgComments === 0 ? 0 : round2(avgLikes / avgComments),
  }
}

function calculatePublishing(videos: NormalizedVideo[]): CompetitorMetrics['publishing'] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
  const totalVideos = videos.length
  const sorted = [...videos].sort((a, b) => a.createTime - b.createTime)
  const firstTime = sorted[0].createTime
  const lastTime = sorted[sorted.length - 1].createTime
  const daySpan = Math.max(1, (lastTime - firstTime) / 86400)
  const avgPerWeek = round2((totalVideos / daySpan) * 7)
  const avgPerMonth = round2((totalVideos / daySpan) * 30)
  const dayCounts: Record<string, number> = {}
  const hourCounts: Record<string, number> = {}

  for (const video of videos) {
    const date = new Date(video.createTime * 1000)
    const dayKey = days[date.getDay()]
    const hourKey = String(date.getHours())
    dayCounts[dayKey] = (dayCounts[dayKey] ?? 0) + 1
    hourCounts[hourKey] = (hourCounts[hourKey] ?? 0) + 1
  }
  const topDayEntry = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]
  const topHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]
  const weeklyPostCounts = Object.values(groupByWeek(videos)).map(bucket => bucket.length)
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
  return {
    total_videos: totalVideos,
    avg_per_week: avgPerWeek,
    avg_per_month: avgPerMonth,
    most_active_day: topDayEntry ? topDayEntry[0] : 'Mon',
    most_active_hour: topHourEntry ? Number(topHourEntry[0]) : 12,
    consistency_score: consistencyScore,
  }
}

function calculateContent(videos: NormalizedVideo[]): CompetitorMetrics['content'] {
  const durationDistribution: Record<string, number> = {
    '<15s': 0,
    '15-60s': 0,
    '1-3min': 0,
    '3-5min': 0,
    '>5min': 0,
  }
  for (const video of videos) {
    if (video.duration < 15) {
      durationDistribution['<15s']++
    } else if (video.duration < 60) {
      durationDistribution['15-60s']++
    } else if (video.duration < 180) {
      durationDistribution['1-3min']++
    } else if (video.duration < 300) {
      durationDistribution['3-5min']++
    } else {
      durationDistribution['>5min']++
    }
  }
  const viewThreshold = avg(videos.map(video => video.views)) * 2
  const viralCount = videos.filter(video => video.views > viewThreshold).length
  const tagCounts: Record<string, number> = {}
  const hashtagRegex = /#[\w\u4e00-\u9fff]+/g
  for (const video of videos) {
    const matches = video.title.match(hashtagRegex) ?? []
    for (const tag of matches) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    }
  }
  const topHashtags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))
  return {
    avg_duration_seconds: Math.round(avg(videos.map(video => video.duration))),
    duration_distribution: durationDistribution,
    viral_ratio: round2(viralCount / videos.length),
    top_hashtags: topHashtags,
  }
}

export function calculateMetrics(
  account: NormalizedAccount,
  videos: NormalizedVideo[],
): CompetitorMetrics {
  if (videos.length === 0) return emptyMetrics()
  return {
    engagement: calculateEngagement(account, videos),
    publishing: calculatePublishing(videos),
    content: calculateContent(videos),
  }
}

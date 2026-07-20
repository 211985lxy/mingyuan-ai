export interface WatchVideoInput {
  videoId: string
  title: string
  coverUrl: string
  createTime: number
  views: number
  likes: number
  comments: number
  shares: number
  collects: number
}

export interface NormalizedVideoWithEngagement extends WatchVideoInput {
  engagementScore: number
}

/**
 * 平台差异化互动权重。
 * - 抖音：收藏 > 分享 > 评论 > 点赞（算法推荐逻辑）
 * - 视频号：分享 > 点赞 > 评论 > 收藏（社交裂变逻辑，点赞=推荐给朋友，分享=转发到微信）
 */
const PLATFORM_WEIGHTS: Record<string, { likes: number; comments: number; collects: number; shares: number }> = {
  douyin: { likes: 1, comments: 2, collects: 3, shares: 4 },
  wechat_channels: { likes: 2, comments: 2, collects: 1, shares: 6 },
  default: { likes: 1, comments: 2, collects: 3, shares: 4 },
}

/**
 * @description 计算平台差异化互动分
 * @param video - 视频数据
 * @param platform - 平台标识
 * @returns number
 */
export function calculateEngagementScore(video: WatchVideoInput, platform?: string): number {
  const w = PLATFORM_WEIGHTS[platform ?? 'default'] ?? PLATFORM_WEIGHTS.default
  return video.likes * w.likes + video.comments * w.comments + video.collects * w.collects + video.shares * w.shares
}

/**
 * @description 计算viralvideos
 * @param videos - videos
 * @param platform - 平台标识（可选，用于差异化权重）
 * @returns NormalizedVideoWithEngagement[]
 */
export function calculateViralVideos(videos: WatchVideoInput[], platform?: string): NormalizedVideoWithEngagement[] {
  return videos
    .map((v) => ({
      ...v,
      engagementScore: calculateEngagementScore(v, platform),
    }))
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, 20)
}

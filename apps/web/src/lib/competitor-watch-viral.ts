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

export function calculateViralVideos(videos: WatchVideoInput[]): NormalizedVideoWithEngagement[] {
  return videos
    .map((v) => ({
      ...v,
      engagementScore: v.likes + v.comments * 2 + v.collects * 3 + v.shares * 4,
    }))
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, 20)
}

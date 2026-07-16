import { getWatchVideoPageUrl } from "@/lib/watch-video-url"

export type WatchVideoRecommendationCategory =
  | "问题解答"
  | "人设故事"
  | "客户案例"
  | "观点判断"
  | "方法清单"
  | "待判断"

export const WATCH_VIDEO_RECOMMENDATION_CATEGORIES: WatchVideoRecommendationCategory[] = [
  "问题解答",
  "人设故事",
  "客户案例",
  "观点判断",
  "方法清单",
]

export interface WatchVideoForRecommendation {
  videoId: string
  title: string
  coverUrl: string
  videoUrl?: string
  createTime: number
  views: number
  likes: number
  comments: number
  shares: number
  collects: number
  engagementScore?: number
}

export interface WatchAccountForRecommendation {
  id: string
  targetUrl: string
  platform: string
  nickname: string | null
  latestVideos: unknown
  viralVideos: unknown
  lastRefreshedAt: Date | string | null
}

export interface WatchVideoRecommendation {
  id: string
  watchAccountId: string
  accountName: string
  accountUrl: string
  platform: string
  videoId: string
  videoUrl: string
  title: string
  coverUrl: string
  createTime: number
  metrics: {
    views: number
    likes: number
    comments: number
    shares: number
    collects: number
    engagementScore: number
  }
  category: WatchVideoRecommendationCategory
  score: number
  recommendationReason: string
  migrationAngle: string
  suggestedHook: string
  suggestedCta: string
  source: "viral" | "latest"
  lastRefreshedAt: string | null
}

type RecommendInput = {
  accounts: WatchAccountForRecommendation[]
  targetText?: string
  categories?: WatchVideoRecommendationCategory[]
  limit?: number
  now?: Date
}

function isVideoList(value: unknown): value is WatchVideoForRecommendation[] {
  return Array.isArray(value)
}

function numberValue(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function engagementScore(video: WatchVideoForRecommendation): number {
  return numberValue(video.engagementScore)
    || numberValue(video.likes)
      + numberValue(video.comments) * 2
      + numberValue(video.collects) * 3
      + numberValue(video.shares) * 4
}

function videoUrl(account: WatchAccountForRecommendation, video: WatchVideoForRecommendation): string {
  return getWatchVideoPageUrl({
    platform: account.platform,
    videoId: video.videoId,
    videoUrl: video.videoUrl,
    fallbackUrl: account.targetUrl,
  })
}

export function classifyWatchVideo(title: string): WatchVideoRecommendationCategory {
  if (/案例|成交|复盘|前后|真实|项目|学员/.test(title)) return "客户案例"
  if (/为什么|怎么|如何|怎么办|吗|？|\?|避坑|问题|到底|该不该/.test(title)) return "问题解答"
  if (/我|经历|故事|老板|创始人|个人|身份|人设|普通人/.test(title)) return "人设故事"
  if (/方法|清单|步骤|技巧|攻略|教程|公式|流程/.test(title)) return "方法清单"
  if (/不要|别|其实|真相|认知|判断|错了|不是|而是/.test(title)) return "观点判断"
  return "待判断"
}

function textTerms(text: string): string[] {
  return text
    .split(/[\s,，。；;、|/\\:：()（）【】\[\]{}"“”]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 12)
    .slice(0, 30)
}

function targetFitScore(title: string, targetText: string | undefined): number {
  const terms = textTerms(targetText || "")
  if (terms.length === 0) return 10
  return terms.some((term) => title.includes(term)) ? 18 : 8
}

function recencyScore(createTime: number, now: Date): number {
  if (!createTime) return 4
  const ageDays = (now.getTime() - createTime * 1000) / 86400000
  if (ageDays <= 7) return 18
  if (ageDays <= 30) return 14
  if (ageDays <= 90) return 8
  return 3
}

function scoreVideo(input: {
  video: WatchVideoForRecommendation
  category: WatchVideoRecommendationCategory
  categories: WatchVideoRecommendationCategory[]
  targetText?: string
  now: Date
}) {
  const heat = Math.min(35, Math.round(Math.log10(engagementScore(input.video) + 1) * 8))
  const category = input.categories.includes(input.category) ? 20 : input.category === "待判断" ? 6 : 10
  const target = targetFitScore(input.video.title, input.targetText)
  const recent = recencyScore(input.video.createTime, input.now)
  const feasible = input.video.title ? 9 : 4
  return Math.min(100, heat + category + target + recent + feasible)
}

function recommendationReason(category: WatchVideoRecommendationCategory, score: number): string {
  if (category === "待判断") return `互动信号可参考，但内容类型需要你再确认，推荐分 ${score}。`
  return `${category}方向，兼顾互动信号和当天可拍性，推荐分 ${score}。`
}

function migrationAngle(category: WatchVideoRecommendationCategory, title: string): string {
  if (category === "客户案例") return `不要复刻案例本身，迁移成你的客户问题、处理过程和结果对比：${title}`
  if (category === "人设故事") return `借它的人设张力，换成你的经历、判断和做事原则：${title}`
  if (category === "问题解答") return `把问题换成目标客户最常问的一句，先回答，再给判断：${title}`
  if (category === "方法清单") return `保留清单结构，替换成你的方法步骤和客户动作：${title}`
  if (category === "观点判断") return `保留反常识判断，换成你对客户选择的提醒：${title}`
  return `先拆它的开头和互动点，再决定能不能迁移到你的业务：${title}`
}

function suggestedHook(category: WatchVideoRecommendationCategory, title: string): string {
  if (category === "问题解答") return `很多客户问我：${title.replace(/[?？]$/, "")}`
  if (category === "客户案例") return "这个案例最值得看的，不是结果，而是中间那个判断。"
  if (category === "人设故事") return "我现在越来越确定，一件事能不能做，先看人。"
  if (category === "方法清单") return "这件事别上来就做，先按这几步过一遍。"
  if (category === "观点判断") return "这个判断可能和你想的不一样。"
  return "这条内容能火，关键不是标题，是它抓住了一个真实问题。"
}

export function recommendWatchVideos(input: RecommendInput): WatchVideoRecommendation[] {
  const categories = input.categories?.length
    ? input.categories
    : WATCH_VIDEO_RECOMMENDATION_CATEGORIES
  const now = input.now ?? new Date()
  const seen = new Set<string>()
  const recommendations: WatchVideoRecommendation[] = []

  for (const account of input.accounts) {
    const groups: Array<{ source: "viral" | "latest"; videos: WatchVideoForRecommendation[] }> = [
      { source: "viral", videos: isVideoList(account.viralVideos) ? account.viralVideos : [] },
      { source: "latest", videos: isVideoList(account.latestVideos) ? account.latestVideos : [] },
    ]

    for (const group of groups) {
      for (const video of group.videos) {
        const key = video.videoId || video.videoUrl || `${account.id}:${video.title}`
        if (!key || seen.has(key)) continue
        seen.add(key)

        const category = classifyWatchVideo(video.title || "")
        const score = scoreVideo({ video, category, categories, targetText: input.targetText, now })
        recommendations.push({
          id: `${account.id}:${key}`,
          watchAccountId: account.id,
          accountName: account.nickname || account.targetUrl,
          accountUrl: account.targetUrl,
          platform: account.platform,
          videoId: video.videoId,
          videoUrl: videoUrl(account, video),
          title: video.title || "无标题作品",
          coverUrl: video.coverUrl || "",
          createTime: numberValue(video.createTime),
          metrics: {
            views: numberValue(video.views),
            likes: numberValue(video.likes),
            comments: numberValue(video.comments),
            shares: numberValue(video.shares),
            collects: numberValue(video.collects),
            engagementScore: engagementScore(video),
          },
          category,
          score,
          recommendationReason: recommendationReason(category, score),
          migrationAngle: migrationAngle(category, video.title || "无标题作品"),
          suggestedHook: suggestedHook(category, video.title || "无标题作品"),
          suggestedCta: "评论区留关键词，我把对应清单或案例拆解发你。",
          source: group.source,
          lastRefreshedAt: account.lastRefreshedAt ? new Date(account.lastRefreshedAt).toISOString() : null,
        })
      }
    }
  }

  return recommendations
    .sort((a, b) => b.score - a.score || b.metrics.engagementScore - a.metrics.engagementScore)
    .slice(0, input.limit ?? 6)
}

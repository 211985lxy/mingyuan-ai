import { LLMClient } from '@/lib/llm'
import type { Platform } from '@/lib/tikhub/types'
import type {
  NormalizedAccount,
  NormalizedVideo,
  NormalizedComment,
  CompetitorMetrics,
  CompetitorAnalysisResult,
} from './types'

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是专业的短视频账号分析师，擅长分析中国主流短视频平台（抖音/小红书/视频号/B站/快手）的创作者账号。
你会基于账号数据生成结构化的竞品分析报告，包含6维评分和可操作建议。
所有分析必须基于数据，不可臆测。输出严格按照 JSON Schema 格式。`

const PLATFORM_CONTEXT: Partial<Record<Platform, string>> = {
  wechat_channels: `\n\n## 平台特征（微信视频号）
- 推荐机制：社交推荐（朋友点赞/转发）+ 算法推荐双引擎，社交裂变权重高于抖音
- 互动模式：点赞=推荐给朋友，分享=转发到微信聊天/朋友圈，社交传播是核心增长引擎
- 用户画像：偏中老年、下沉市场渗透率高，与抖音年轻用户互补
- 内容偏好：知识类、生活类、情感类内容表现突出，强营销内容易被降权
- 数据特点：不公开关注数，播放量包含社交推荐流量，互动率计算需考虑社交裂变因素
- 分析注意：视频号 followingCount 可能为 0（平台不公开），跳过“关注比”指标，不影响核心评分`,
  douyin: `\n\n## 平台特征（抖音）
- 推荐机制：纯算法推荐（完播率 > 互动率 > 关注关系），去中心化流量分配
- 互动模式：点赞/评论/分享/收藏四维互动，完播率是核心权重
- 数据特点：播放量精确，互动数据透明，粉丝画像可获取`,
}

/**
 * @description 构建publicvideourl
 * @param video - 视频
 * @returns string
 */
export function buildPublicVideoUrl(video: Pick<NormalizedVideo, 'videoId' | 'videoUrl'>): string {
  if (video.videoUrl.includes('/video/')) return video.videoUrl
  if (video.videoId) return `https://www.douyin.com/video/${video.videoId}`
  return video.videoUrl
}

function buildAnalysisStats(account: NormalizedAccount, videos: NormalizedVideo[]) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
  const postingHeatmap: Record<string, number> = {}
  for (const video of videos) {
    const date = new Date(video.createTime * 1000)
    const key = `${days[date.getDay()]}-${String(date.getHours()).padStart(2, '0')}`
    postingHeatmap[key] = (postingHeatmap[key] ?? 0) + 1
  }

  const topVideos = [...videos]
    .sort((a, b) => (b.views || b.likes) - (a.views || a.likes))
    .slice(0, 10)
    .map(video => {
      const denominator = video.views > 0 ? video.views : (account.followerCount || 1)
      return {
        title: video.title,
        views: video.views,
        likes: video.likes,
        engagement_rate: Math.round(
          ((video.likes + video.comments + video.shares) / denominator) * 10000,
        ) / 100,
        url: buildPublicVideoUrl(video),
      }
    })

  const today = new Date().toISOString().split('T')[0]
  const sortedByTime = [...videos].sort((a, b) => a.createTime - b.createTime)
  const first = sortedByTime[0]
  const last = sortedByTime[sortedByTime.length - 1]
  return {
    total_videos_analyzed: videos.length,
    date_range: {
      from: first ? new Date(first.createTime * 1000).toISOString().split('T')[0] : today,
      to: last ? new Date(last.createTime * 1000).toISOString().split('T')[0] : today,
    },
    top_videos: topVideos,
    posting_heatmap: postingHeatmap,
  }
}

function buildAnalysisPrompt(
  account: NormalizedAccount,
  videos: NormalizedVideo[],
  comments: NormalizedComment[],
  metrics: CompetitorMetrics,
): string {
  const compactAccount = {
    nickname: account.nickname,
    followers: account.followerCount,
    following: account.followingCount,
    totalLikes: account.totalLikes,
    videoCount: account.videoCount,
    signature: account.signature,
    isVerified: account.isVerified,
  }
  const videoSubset = videos.slice(0, 20)
  const compactVideos = videoSubset.map(video => ({
    t: video.title.slice(0, 50),
    dur: video.duration,
    v: video.views,
    l: video.likes,
    c: video.comments,
    s: video.shares,
    col: video.collects,
    ts: new Date(video.createTime * 1000).toISOString().split('T')[0],
  }))
  const compactComments = comments.slice(0, 30).map(comment => ({
    t: comment.text.slice(0, 80),
    l: comment.likes,
  }))

  return `分析以下短视频账号并生成竞品分析报告。

## 账号信息
${JSON.stringify(compactAccount)}

## 视频数据（${videoSubset.length}条，字段：t=标题,dur=时长秒,v=播放,l=点赞,c=评论,s=分享,col=收藏,ts=日期）
${JSON.stringify(compactVideos)}

## 量化指标
${JSON.stringify(metrics)}

## 评论样本（${compactComments.length}条，t=内容,l=点赞）
${JSON.stringify(compactComments)}

输出JSON格式（不含其他文字），结构如下：
{"scores":{"content_power":0-100,"growth_power":0-100,"engagement_power":0-100,"monetization_power":0-100,"persona_power":0-100,"operation_power":0-100,"overall":加权平均},"sections":{"account_overview":{"account_type":"","content_vertical":"","positioning":"","differentiator":""},"content_strategy":{"topic_distribution":[{"topic":"","percentage":0}],"content_formats":[{"format":"","percentage":0}],"hook_patterns":[""],"posting_frequency":"","best_posting_times":"","viral_formula":""},"growth_analysis":{"growth_trend":"","growth_drivers":[""],"follower_quality":""},"engagement_analysis":{"avg_engagement_rate":0,"avg_likes":0,"avg_comments":0,"avg_shares":0,"comment_quality":"","anomaly_detection":""},"monetization_analysis":{"monetization_paths":[""],"product_categories":[""],"estimated_revenue_level":""},"recommendations":{"reusable_strategies":[""],"differentiation_points":[""],"action_plan_30d":[""],"risks":[""]}}}
每个字段值用中文，简洁精炼（每项1-2句话），评分基于数据。`
}

function parseAnalysisResult(content: string): CompetitorAnalysisResult {
  let raw = content.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  }

  let parsed: CompetitorAnalysisResult
  try {
    parsed = JSON.parse(raw) as CompetitorAnalysisResult
  } catch {
    throw new Error('AI 分析结果解析失败，请重试')
  }
  if (!parsed.scores || typeof parsed.scores !== 'object') {
    throw new Error('AI 分析结果格式异常（缺少评分数据），请重试')
  }
  if (!parsed.sections || typeof parsed.sections !== 'object') {
    throw new Error('AI 分析结果格式异常（缺少报告内容），请重试')
  }
  return parsed
}

function clampAnalysisScores(result: CompetitorAnalysisResult): void {
  const clamp = (value: number) => Math.max(0, Math.min(100, value))
  result.scores.content_power = clamp(result.scores.content_power)
  result.scores.growth_power = clamp(result.scores.growth_power)
  result.scores.engagement_power = clamp(result.scores.engagement_power)
  result.scores.monetization_power = clamp(result.scores.monetization_power)
  result.scores.persona_power = clamp(result.scores.persona_power)
  result.scores.operation_power = clamp(result.scores.operation_power)
  result.scores.overall = clamp(result.scores.overall)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @description 分析competitor
 * @param account - 账户
 * @param videos - videos
 * @param comments - comments
 * @param metrics - metrics
 * @param platform - 平台
 * @returns Promise<CompetitorAnalysisResult>
 */
export async function analyzeCompetitor(
  account: NormalizedAccount,
  videos: NormalizedVideo[],
  comments: NormalizedComment[],
  metrics: CompetitorMetrics,
  platform: Platform = 'douyin',
): Promise<CompetitorAnalysisResult> {
  const llm = LLMClient.shared()
  const stats = buildAnalysisStats(account, videos)
  const platformContext = PLATFORM_CONTEXT[platform] ?? ''
  const response = await llm.complete({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildAnalysisPrompt(account, videos, comments, metrics) + platformContext },
    ],
    temperature: 0.3,
    maxTokens: 3500,
    responseFormat: { type: 'json_object' },
  })

  const parsed = parseAnalysisResult(response.content)
  clampAnalysisScores(parsed)
  parsed.stats = stats

  return parsed
}

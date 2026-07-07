import { LLMClient } from '@/lib/llm'
import type {
  NormalizedAccount,
  NormalizedVideo,
  NormalizedComment,
  CompetitorMetrics,
  CompetitorAnalysisResult,
} from './types'

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是专业的短视频账号分析师，擅长分析中国主流短视频平台（抖音/小红书/B站/快手）的创作者账号。
你会基于账号数据生成结构化的竞品分析报告，包含6维评分和可操作建议。
所有分析必须基于数据，不可臆测。输出严格按照 JSON Schema 格式。`

export function buildPublicVideoUrl(video: Pick<NormalizedVideo, 'videoId' | 'videoUrl'>): string {
  if (video.videoUrl.includes('/video/')) return video.videoUrl
  if (video.videoId) return `https://www.douyin.com/video/${video.videoId}`
  return video.videoUrl
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function analyzeCompetitor(
  account: NormalizedAccount,
  videos: NormalizedVideo[],
  comments: NormalizedComment[],
  metrics: CompetitorMetrics,
): Promise<CompetitorAnalysisResult> {
  const llm = LLMClient.shared()

  // ── Build posting heatmap from video timestamps ───────────────────────────
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
  const heatmap: Record<string, number> = {}
  for (const v of videos) {
    const d = new Date(v.createTime * 1000)
    const key = `${days[d.getDay()]}-${String(d.getHours()).padStart(2, '0')}`
    heatmap[key] = (heatmap[key] ?? 0) + 1
  }

  // ── Build top 10 videos by views, falling back to likes only for sorting.
  const topVideos = [...videos]
    .sort((a, b) => (b.views || b.likes) - (a.views || a.likes))
    .slice(0, 10)
    .map(v => {
      const denominator = v.views > 0 ? v.views : (account.followerCount || 1)
      return {
        title: v.title,
        views: v.views,
        likes: v.likes,
        engagement_rate: Math.round(((v.likes + v.comments + v.shares) / denominator) * 10000) / 100,
        url: buildPublicVideoUrl(v),
      }
    })

  // ── Date range from sorted videos ─────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const sortedByTime = [...videos].sort((a, b) => a.createTime - b.createTime)
  const dateFrom = sortedByTime[0]
    ? new Date(sortedByTime[0].createTime * 1000).toISOString().split('T')[0]
    : today
  const dateTo = sortedByTime[sortedByTime.length - 1]
    ? new Date(sortedByTime[sortedByTime.length - 1].createTime * 1000).toISOString().split('T')[0]
    : today

  // ── Build compact user prompt (reduce token count for faster LLM response) ─
  const compactAccount = {
    nickname: account.nickname,
    followers: account.followerCount,
    following: account.followingCount,
    totalLikes: account.totalLikes,
    videoCount: account.videoCount,
    signature: account.signature,
    isVerified: account.isVerified,
  }

  // Only send top 20 videos to keep prompt manageable and avoid LLM gateway timeout
  const videoSubset = videos.slice(0, 20)
  const compactVideos = videoSubset.map(v => ({
    t: v.title.slice(0, 50),
    dur: v.duration,
    v: v.views,
    l: v.likes,
    c: v.comments,
    s: v.shares,
    col: v.collects,
    ts: new Date(v.createTime * 1000).toISOString().split('T')[0],
  }))

  // Only send top 30 comments
  const compactComments = comments.slice(0, 30).map(c => ({
    t: c.text.slice(0, 80),
    l: c.likes,
  }))

  const userPrompt = `分析以下短视频账号并生成竞品分析报告。

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

  // ── Call LLM ──────────────────────────────────────────────────────────────
  const response = await llm.complete({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 3500,
    responseFormat: { type: 'json_object' },
  })

  // ── Strip markdown code fences if present ─────────────────────────────────
  let raw = response.content.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  }

  let parsed: CompetitorAnalysisResult
  try {
    parsed = JSON.parse(raw) as CompetitorAnalysisResult
  } catch {
    throw new Error('AI 分析结果解析失败，请重试')
  }

  // Validate required structure
  if (!parsed.scores || typeof parsed.scores !== 'object') {
    throw new Error('AI 分析结果格式异常（缺少评分数据），请重试')
  }
  if (!parsed.sections || typeof parsed.sections !== 'object') {
    throw new Error('AI 分析结果格式异常（缺少报告内容），请重试')
  }

  // ── Clamp all scores to [0, 100] ──────────────────────────────────────────
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  parsed.scores.content_power = clamp(parsed.scores.content_power)
  parsed.scores.growth_power = clamp(parsed.scores.growth_power)
  parsed.scores.engagement_power = clamp(parsed.scores.engagement_power)
  parsed.scores.monetization_power = clamp(parsed.scores.monetization_power)
  parsed.scores.persona_power = clamp(parsed.scores.persona_power)
  parsed.scores.operation_power = clamp(parsed.scores.operation_power)
  parsed.scores.overall = clamp(parsed.scores.overall)

  // ── Inject authoritative stats (computed from raw data, not LLM output) ──
  parsed.stats = {
    total_videos_analyzed: videos.length,
    date_range: { from: dateFrom, to: dateTo },
    top_videos: topVideos,
    posting_heatmap: heatmap,
  }

  return parsed
}

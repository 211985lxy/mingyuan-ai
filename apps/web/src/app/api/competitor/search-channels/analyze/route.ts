import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { tikhubGet } from "@/lib/tikhub/client"
import { LLMClient } from "@/lib/llm"
import { z } from "zod"

const bodySchema = z.object({
  keyword: z.string().trim().min(1).max(200),
  count: z.number().int().min(5).max(50).default(20),
}).strict()

// ─── Wire Types ───

interface SearchVideoItem {
  object_id?: string
  video_id?: string
  description?: string
  title?: string
  cover_url?: string
  thumb_url?: string
  create_time?: number
  publish_time?: number
  duration?: number
  play_count?: number
  read_count?: number
  like_count?: number
  recommend_count?: number
  comment_count?: number
  share_count?: number
  forward_count?: number
  collect_count?: number
  fav_count?: number
  nickname?: string
  finder_username?: string
}

interface SearchVideoResult {
  list?: SearchVideoItem[]
  video_list?: SearchVideoItem[]
}

const TOPIC_ANALYSIS_PROMPT = `你是视频号选题分析专家。基于搜索结果数据，输出JSON格式的选题热度分析报告。

输出JSON结构（不含其他文字）：
{"heat_score":0-100,"heat_level":"高热|中热|低热|冷门","total_videos_analyzed":0,"analysis":{"content_format_distribution":[{"format":"口播|剧情|教程|vlog|混剪|其他","percentage":0}],"top_creators":[{"nickname":"","follower_hint":"","video_count_in_results":0}],"engagement_overview":{"avg_views":0,"avg_likes":0,"avg_comments":0,"avg_shares":0,"top_video_views":0},"trend_signals":[""],"differentiation_opportunities":[""],"recommended_angles":[""],"risk_notes":[""]},"summary":"一段话总结该选题在视频号的热度、竞争格局和切入建议"}
每个字段值用中文，简洁精炼。`

/**
 * POST /api/competitor/search-channels/analyze
 * 视频号选题热度分析（搜索 + AI 分析）
 */
export const POST = withUserAuth(async (request, { user: _user }) => {
  const body = await parseJsonBody(request, bodySchema, { maxBytes: 4 * 1024 })

  // Step 1: 搜索视频号视频
  let items: SearchVideoItem[]
  try {
    const data = await tikhubGet<SearchVideoResult>(
      '/api/v1/wechat/search/v2/search_channels_video',
      { keyword: body.keyword, count: body.count },
    )
    items = data.list ?? data.video_list ?? []
  } catch (err) {
    const message = err instanceof Error ? err.message : '搜索视频号视频失败'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  if (items.length === 0) {
    return NextResponse.json({
      keyword: body.keyword,
      videosFound: 0,
      analysis: null,
      message: '未找到相关视频号视频，请尝试其他关键词',
    })
  }

  // Step 2: 构建数据摘要
  const videoSummaries = items.map((item, i) => ({
    idx: i + 1,
    title: (item.description ?? item.title ?? '').slice(0, 60),
    author: item.nickname ?? '',
    views: item.play_count ?? item.read_count ?? 0,
    likes: item.like_count ?? item.recommend_count ?? 0,
    comments: item.comment_count ?? 0,
    shares: item.share_count ?? item.forward_count ?? 0,
    duration: item.duration ?? 0,
  }))

  // Step 3: AI 分析
  try {
    const llm = LLMClient.shared()
    const response = await llm.complete({
      messages: [
        { role: 'system', content: TOPIC_ANALYSIS_PROMPT },
        {
          role: 'user',
          content: `分析关键词「${body.keyword}」在视频号的选题热度。\n\n搜索结果（${videoSummaries.length}条视频）：\n${JSON.stringify(videoSummaries)}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 2000,
      responseFormat: { type: 'json_object' },
    })

    let analysisResult: unknown
    try {
      let raw = response.content.trim()
      if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
      analysisResult = JSON.parse(raw)
    } catch {
      analysisResult = { summary: response.content }
    }

    return NextResponse.json({
      keyword: body.keyword,
      videosFound: items.length,
      analysis: analysisResult,
    })
  } catch (err) {
    // AI 分析失败时仍返回搜索结果
    return NextResponse.json({
      keyword: body.keyword,
      videosFound: items.length,
      analysis: null,
      analysisError: err instanceof Error ? err.message : 'AI 分析暂时不可用',
    })
  }
})

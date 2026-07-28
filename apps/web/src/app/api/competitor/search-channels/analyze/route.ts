import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm"
import { searchWechatChannelsVideos, type WechatChannelsSearchVideo } from "@/lib/tikhub/search-wechat-channels-videos"
import { z } from "zod"

const bodySchema = z.object({
  keyword: z.string().trim().min(1).max(200),
  count: z.number().int().min(5).max(50).default(20),
}).strict()

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

  let items: WechatChannelsSearchVideo[]
  try {
    const data = await searchWechatChannelsVideos({
      keyword: body.keyword,
      count: body.count,
      sortType: "popular",
    })
    items = data.list
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

  const videoSummaries = items.map((item, i) => ({
    idx: i + 1,
    title: (item.description || item.title).slice(0, 60),
    author: item.nickname,
    views: item.play_count,
    likes: item.like_count,
    comments: item.comment_count,
    shares: item.share_count,
    duration: item.duration,
  }))

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
    return NextResponse.json({
      keyword: body.keyword,
      videosFound: items.length,
      analysis: null,
      analysisError: err instanceof Error ? err.message : 'AI 分析暂时不可用',
    })
  }
})

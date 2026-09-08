import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm"
import { parseCapabilityInput } from "@/lib/api/contracts"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"
import { searchWechatChannelsVideos, type WechatChannelsSearchVideo } from "@/lib/tikhub/search-wechat-channels-videos"
// api-inventory: domain=competitor
// api-inventory: kind=capability
// api-inventory: orchestratable=true


/**
 * POST /api/competitor/search-channels/analyze
 * 视频号选题热度分析（搜索 + AI 分析）
 */
export const POST = withUserAuth(async (request, { user: _user }) => {
  const body = (await parseCapabilityInput("/api/competitor/search-channels/analyze", request, {
    maxBytes: 4 * 1024,
  })) as { keyword: string; count: number }

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
        { role: 'system', content: promptRegistry.get(PROMPT_KEYS.competitorChannelsTopicAnalysis).content },
        {
          role: 'user',
          content: fillPromptTemplate(
            promptRegistry.get(PROMPT_KEYS.competitorChannelsTopicAnalysisUser).content,
            {
              keyword: body.keyword,
              videoCount: String(videoSummaries.length),
              videoSummariesJson: JSON.stringify(videoSummaries),
            },
          ),
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

import { NextResponse } from "next/server"
import { assertSupportedVideoUrl, detectVideoPlatform, formatVideoTextExtractionError } from "@/lib/video-text-extractor"
import { processVideo } from "@/lib/content-pipeline"

export const maxDuration = 120

/**
 * 视频处理 API 端点
 *
 * 接受视频链接，执行完整的处理流水线：
 *   1. 轻抖 API 提取文案
 *   2. LLM 生成 AI 总结
 *   3. 写入飞书 Base
 *
 * 可由以下场景调用：
 *   - 飞书事件端点（路由一）
 *   - 公众号消息端点（路由二）
 *   - 前端手动触发
 *   - Cron 任务回填
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { url, source, contextText, skipAiProcessing } = body as {
      url?: string
      source?: string
      contextText?: string
      skipAiProcessing?: boolean
    }

    // 参数校验
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 })
    }

    let validatedUrl: string
    try {
      validatedUrl = assertSupportedVideoUrl(url)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "无效的视频链接" },
        { status: 400 },
      )
    }

    const platform = detectVideoPlatform(validatedUrl)
    const sourceLabel = source || (platform === "channels" ? "视频号" : platform === "douyin" ? "抖音" : "其他")

    // 执行处理流水线
    const result = await processVideo({
      videoUrl: validatedUrl,
      source: sourceLabel,
      contextText,
      skipAiProcessing,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          durationMs: result.durationMs,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      recordId: result.recordId,
      videoTitle: result.aiSummary?.title || result.extraction?.title,
      platform,
      aiSummary: result.aiSummary?.summary,
      keyPoints: result.aiSummary?.keyPoints,
      durationMs: result.durationMs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "内部错误" },
      { status: 500 },
    )
  }
}

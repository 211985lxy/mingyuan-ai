import { NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import { assertSupportedVideoUrl, detectVideoPlatform } from "@/lib/video-text-extractor"
import { processVideo } from "@/lib/content-pipeline"

export const maxDuration = 120

const processVideoSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  source: z.string().trim().max(60).optional(),
  contextText: z.string().max(8000).optional(),
  userId: z.string().trim().max(120).optional(),
  skipAiProcessing: z.boolean().optional(),
  skipTopicExtraction: z.boolean().optional(),
  skipCompetitorCheck: z.boolean().optional(),
  skipCopyInspiration: z.boolean().optional(),
}).strict()

/**
 * 视频处理 API 端点
 *
 * 接受视频链接，执行完整 5a-5e 处理流水线。
 * 可由飞书事件、公众号端点、前端或 Cron 调用。
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, processVideoSchema)
    const { url, source, contextText, userId, skipAiProcessing, skipTopicExtraction, skipCompetitorCheck, skipCopyInspiration } = body

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

    const result = await processVideo({
      videoUrl: validatedUrl,
      source: sourceLabel,
      contextText,
      userId,
      skipAiProcessing,
      skipTopicExtraction,
      skipCompetitorCheck,
      skipCopyInspiration,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error, durationMs: result.durationMs }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      recordId: result.recordId,
      videoTitle: result.aiSummary?.title || result.extraction?.title,
      platform,
      aiSummary: result.aiSummary?.summary,
      keyPoints: result.aiSummary?.keyPoints,
      topicCount: result.topicExtraction?.cards?.length,
      isCompetitor: result.competitorMatch?.isCompetitor,
      hasCopyInspiration: result.copyInspiration?.success,
      durationMs: result.durationMs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "内部错误" },
      { status: 500 },
    )
  }
}
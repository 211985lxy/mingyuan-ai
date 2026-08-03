import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import { assertSupportedVideoUrl, detectVideoPlatform } from "@/lib/video-text-extractor"
import { processVideo } from "@/lib/content-pipeline"
import { validateCronSecret } from "@/lib/admin-auth"
import { withUserAuth } from "@/lib/user-auth"
import { env } from "@/env"

export const maxDuration = 120

const processVideoSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  source: z.string().trim().max(60).optional(),
  contextText: z.string().max(8000).optional(),
  // userId 仅内部通道（cron/飞书事件）允许传入；用户通道会忽略它，
  // 强制取用 JWT 中的用户身份，杜绝越权把数据写到他人账户下。
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
 * 双通道鉴权：
 *   - 内部通道（飞书事件 / 公众号端点 / Cron）：`Authorization: Bearer <CRON_SECRET>`
 *   - 用户通道（前端）：登录态 JWT，归属 userId 取自 token，不可被请求体覆盖。
 *
 * 安全要点：用户通道下，`userId` 始终来自鉴权上下文，绝不取自请求体，
 * 否则攻击者可伪造 userId 将视频处理结果/费用写入他人账户（横向越权 + 费用耗尽）。
 */
export async function POST(request: NextRequest) {
  // 内部通道：CRON_SECRET（fail-closed：未配置则 validateCronSecret 返回 false）
  if (validateCronSecret(request)) {
    return runInternalPipeline(request)
  }
  // 用户通道：JWT 鉴权
  return userPipelineHandler(request, { params: Promise.resolve({}) })
}

/** 内部通道：允许请求体指定归属用户（飞书事件携带的特定用户），缺省回落 CONTENT_PIPELINE_USER_ID。 */
async function runInternalPipeline(request: NextRequest) {
  try {
    const body = await parseJsonBody(request, processVideoSchema)
    const userId = body.userId?.trim() || env.CONTENT_PIPELINE_USER_ID?.trim() || undefined
    return await executePipeline(body, userId)
  } catch (error) {
    return pipelineErrorResponse(error)
  }
}

/** 用户通道：userId 强制取自 JWT，请求体的 userId 被忽略。 */
const userPipelineHandler = withUserAuth(async (request, { user }) => {
  try {
    const body = await parseJsonBody(request, processVideoSchema)
    return await executePipeline(body, user.id)
  } catch (error) {
    return pipelineErrorResponse(error)
  }
})

async function executePipeline(
  body: z.infer<typeof processVideoSchema>,
  userId: string | undefined,
) {
  const { url, source, contextText, skipAiProcessing, skipTopicExtraction, skipCompetitorCheck, skipCopyInspiration } = body

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
}

function pipelineErrorResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "内部错误" },
    { status: 500 },
  )
}
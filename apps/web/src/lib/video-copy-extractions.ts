import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { analyzeVideoCopy } from "@/lib/video-copy-analysis"
import {
  assertSupportedVideoUrl,
  assertVideoTextProviderReady,
  detectVideoPlatform,
  fetchVideoTextExtractionResult,
  formatVideoTextExtractionError,
  submitVideoTextExtractionTask,
} from "@/lib/video-text-extractor"
import { getAdapter } from "@/lib/tikhub/adapters/index"
import type { Platform } from "@/lib/tikhub/types"
import { parseUrl } from "@/lib/tikhub/url-parser"
import type { NormalizedComment } from "@/lib/tikhub/types"
import {
  assertFallbackResultLimits,
  fetchFallbackVideoExtraction,
  submitFallbackVideoExtraction,
} from "@/lib/video-extraction-fallback"

const VIDEO_COPY_ANALYSIS_VERSION = "timeline-12s-v1"

type VideoCopyExtractionRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.videoCopyExtraction.findUnique>>
>

export interface ApiVideoCopyExtraction {
  id: string
  sourceUrl: string
  platform: string
  provider: string
  status: string
  errorMessage: string | null
  analysisError: string | null
  videoTitle: string | null
  videoCover: string | null
  videoDuration: string | null
  transcript: string | null
  analysisResult: unknown | null
  topComments: TopCommentEntry[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface TopCommentEntry {
  text: string
  likes: number
  isTop: boolean
}

function extractVideoId(platform: string, url: string): string | null {
  if (platform === "douyin") {
    const parsed = parseUrl(url)
    if (!parsed) return null

    // douyin 视频/分享链接提取 videoId: /video/<id> 或短链接经过 resolveUrl 后解析
    const lower = url.toLowerCase()
    const videoMatch = lower.match(/\/video\/(\d+)/)
    if (videoMatch) return videoMatch[1]

    // 短链无法直接提取 id，记录 platform 等 resolveUrl 完成后再补提
    const shortLink = /\/(share|v\.douyin\.com)/i.test(url)
    if (shortLink) return null

    return null
  }

  if (platform === "channels" || platform === "wechat_channels") {
    // 视频号视频链接：/feed/<object_id> 或 /web/pages/feed/<object_id>
    try {
      const pathname = new URL(url).pathname
      const feedMatch = pathname.match(/\/feed\/([\w]+)/)
      if (feedMatch) return feedMatch[1]
    } catch { /* ignore */ }
    return null
  }

  return null
}

async function fetchTopComments(
  platform: string,
  sourceUrl: string,
): Promise<TopCommentEntry[]> {
  const videoId = extractVideoId(platform, sourceUrl)
  if (!videoId) return []

  // 支持 douyin/xiaohongshu/wechat_channels 的 fetchComments
  if (platform !== "douyin" && platform !== "xiaohongshu" && platform !== "channels" && platform !== "wechat_channels") return []

  try {
    const adapterPlatform: Platform = platform === 'channels' ? 'wechat_channels' : platform as Platform
    const adapter = getAdapter(adapterPlatform)
    const comments = await adapter.fetchComments(videoId, 20)

    return comments
      .filter((c: NormalizedComment) => c.likes >= 100)
      .slice(0, 10)
      .map((c: NormalizedComment) => ({
        text: c.text,
        likes: c.likes,
        isTop: c.isTop,
      }))
  } catch {
    return []
  }
}

/**
 * @description serializevideocopyextraction
 * @param record - 记录
 * @returns ApiVideoCopyExtraction
 */
export function serializeVideoCopyExtraction(
  record: VideoCopyExtractionRecord,
): ApiVideoCopyExtraction {
  return {
    id: record.id,
    sourceUrl: record.sourceUrl,
    platform: record.platform,
    provider: record.provider,
    status: record.status,
    errorMessage: record.errorMessage,
    analysisError: record.analysisError,
    videoTitle: record.videoTitle,
    videoCover: record.videoCover,
    videoDuration: record.videoDuration,
    transcript: record.transcript,
    analysisResult: record.analysisResult,
    topComments: (record.analysisResult as { topComments?: TopCommentEntry[] } | null)?.topComments ?? [],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
  }
}

/**
 * @description 创建videocopyextraction
 * @param userId - 用户 ID
 * @param inputUrl - 输入数据URL 地址
 * @returns Promise<VideoCopyExtractionRecord>
 */
export async function createVideoCopyExtraction(
  userId: string,
  inputUrl: string
): Promise<VideoCopyExtractionRecord> {
  const sourceUrl = assertSupportedVideoUrl(inputUrl)
  const platform = detectVideoPlatform(sourceUrl)
  assertVideoTextProviderReady(platform)

  const record = await prisma.videoCopyExtraction.create({
    data: {
      userId,
      sourceUrl,
      platform,
      status: "queued",
    },
  })

  try {
    const task = await submitVideoTextExtractionTask(sourceUrl)
    return prisma.videoCopyExtraction.update({
      where: { id: record.id },
      data: {
        status: "extracting",
        providerBatchId: task.batchId,
        errorMessage: null,
      },
    })
  } catch (error) {
    return prisma.videoCopyExtraction.update({
      where: { id: record.id },
      data: {
        status: "failed",
        errorMessage: formatVideoTextExtractionError(error),
      },
    })
  }
}

/**
 * @description 获取videocopyextractionforuser
 * @param userId - 用户 ID
 * @param id - 唯一标识符
 * @returns Promise<VideoCopyExtractionRecord | null>
 */
export async function getVideoCopyExtractionForUser(
  userId: string,
  id: string
): Promise<VideoCopyExtractionRecord | null> {
  return prisma.videoCopyExtraction.findFirst({
    where: { id, userId },
  })
}

/**
 * @description 启动videocopyextractionfallback
 * @param userId - 用户 ID
 * @param id - 唯一标识符
 * @returns Promise<VideoCopyExtractionRecord | null>
 */
export async function startVideoCopyExtractionFallback(
  userId: string,
  id: string,
): Promise<VideoCopyExtractionRecord | null> {
  const record = await getVideoCopyExtractionForUser(userId, id)
  if (!record) return null
  if (record.provider === "self_hosted" && record.fallbackJobId && record.status !== "failed") return record

  try {
    const result = await submitFallbackVideoExtraction(record.sourceUrl)
    return prisma.videoCopyExtraction.update({
      where: { id: record.id },
      data: {
        provider: "self_hosted",
        fallbackJobId: result.jobId,
        status: result.status === "failed" ? "failed" : "extracting",
        errorMessage: result.status === "failed" ? result.errorMessage || "自托管文案提取失败。" : null,
      },
    })
  } catch (error) {
    return prisma.videoCopyExtraction.update({
      where: { id: record.id },
      data: {
        provider: "self_hosted",
        status: "failed",
        errorMessage: formatVideoTextExtractionError(error),
      },
    })
  }
}

/**
 * @description 同步videocopyextraction
 * @param userId - 用户 ID
 * @param id - 唯一标识符
 * @returns Promise<VideoCopyExtractionRecord | null>
 */
export async function syncVideoCopyExtraction(
  userId: string,
  id: string
): Promise<VideoCopyExtractionRecord | null> {
  const record = await getVideoCopyExtractionForUser(userId, id)
  if (!record) return null

  if (record.status === "completed" || record.status === "failed") {
    return record
  }

  if (record.provider === "self_hosted") {
    if (!record.fallbackJobId) {
      return prisma.videoCopyExtraction.update({
        where: { id: record.id },
        data: { status: "failed", errorMessage: "自托管文案提取任务不存在，请重新提交链接。" },
      })
    }
    if (!record.transcript) {
      try {
        const result = await fetchFallbackVideoExtraction(record.fallbackJobId)
        if (result.status === "extracting") return record
        if (result.status === "failed" || !result.transcript) {
          return prisma.videoCopyExtraction.update({
            where: { id: record.id },
            data: { status: "failed", errorMessage: result.errorMessage || "自托管文案提取失败。" },
          })
        }
        assertFallbackResultLimits(result)
        await prisma.videoCopyExtraction.update({
          where: { id: record.id },
          data: {
            status: "analyzing",
            videoTitle: result.title,
            videoCover: result.coverUrl,
            videoDuration: result.durationSeconds ? String(result.durationSeconds) : null,
            transcript: result.transcript,
            errorMessage: null,
          },
        })
      } catch (error) {
        return prisma.videoCopyExtraction.update({
          where: { id: record.id },
          data: { status: "failed", errorMessage: formatVideoTextExtractionError(error) },
        })
      }
    }
  } else if (!record.providerBatchId) {
    return prisma.videoCopyExtraction.update({
      where: { id: record.id },
      data: {
        status: "failed",
        errorMessage: "文案提取任务不存在，请重新提交链接。",
      },
    })
  } else if (!record.transcript) {
    try {
      const result = await fetchVideoTextExtractionResult(record.providerBatchId)
      if (result.status === "extracting") {
        return prisma.videoCopyExtraction.update({
          where: { id: record.id },
          data: { status: "extracting" },
        })
      }

      if (result.status === "failed") {
        return prisma.videoCopyExtraction.update({
          where: { id: record.id },
          data: {
            status: "failed",
            errorMessage: result.errorMessage ?? "该视频暂时无法提取文案，请换一个链接试试。",
          },
        })
      }

      await prisma.videoCopyExtraction.update({
        where: { id: record.id },
        data: {
          status: "analyzing",
          platform: result.platform ?? record.platform,
          videoTitle: result.title,
          videoCover: result.coverUrl,
          videoDuration: result.duration,
          transcript: result.transcript,
          providerTaskId: result.providerTaskId,
          errorMessage: null,
        },
      })
    } catch (error) {
      return prisma.videoCopyExtraction.update({
        where: { id: record.id },
        data: {
          status: "failed",
          errorMessage: formatVideoTextExtractionError(error),
        },
      })
    }
  }

  const latest = await getVideoCopyExtractionForUser(userId, id)
  if (!latest?.transcript) return latest
  const currentAnalysis = latest.analysisResult as { analysisVersion?: unknown } | null
  if (currentAnalysis?.analysisVersion === VIDEO_COPY_ANALYSIS_VERSION) return latest

  try {
    const analysis = await analyzeVideoCopy({
      title: latest.videoTitle,
      platform: latest.platform,
      videoDuration: latest.videoDuration,
      transcript: latest.transcript,
    })

    // 分析完成后，抓取热评一并存进 analysisResult JSON
    const comments = await fetchTopComments(latest.platform, latest.sourceUrl)
    const newAnalysisResult: Record<string, unknown> = {
      markdown: analysis.markdown,
      analysisVersion: VIDEO_COPY_ANALYSIS_VERSION,
    }
    if (comments.length > 0) {
      newAnalysisResult.topComments = comments
    }

    return prisma.videoCopyExtraction.update({
      where: { id: latest.id },
      data: {
        status: "completed",
        analysisResult: newAnalysisResult as unknown as Prisma.InputJsonValue,
        analysisError: null,
        errorMessage: null,
        completedAt: new Date(),
      },
    })
  } catch {
    return prisma.videoCopyExtraction.update({
      where: { id: latest.id },
      data: {
        status: "completed",
        analysisError: "文案已提取，结构化分析暂时失败，请稍后重试。",
        completedAt: new Date(),
      },
    })
  }
}

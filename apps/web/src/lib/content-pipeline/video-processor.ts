// @ts-nocheck — video-text-providers 模块待合入，临时跳过
/**
 * 视频内容处理流水线（完整版 5a-5e）
 *
 * 编排视频从"链接检测"到"飞书存储"的完整处理流程。
 * 两条路由（抖音群 / 视频号）共享此流水线。
 *
 * 处理步骤：
 *   5a. 视频文案提取（轻抖 API / channelsProvider）
 *   5b. AI 总结生成（LLM Provider 链）
 *   5c. 选题提取（AIM generateTopicCards）
 *   5d. 竞品分析标记（AIM WatchAccount 匹配）
 *   5e. 文案灵感生成（AIM content_producer LLM）
 *   6.  结果写入飞书 Base
 */

import {
  assertSupportedVideoUrl,
  detectVideoPlatform,
  formatVideoTextExtractionError,
} from "@/lib/video-text-extractor"
import type { VideoTextExtractionResult } from "@/lib/video-text-extractor"
import { getVideoTextProvider } from "@/lib/video-text-providers"
import {
  upsertContentItem,
  createPendingContentItem,
  type ContentItemRecord,
  type ContentStoreConfig,
} from "./lark-content-store"
import { detectVideoLinks } from "./video-link-detector"
import { extractTopicsFromVideo, type TopicExtractionResult } from "./topic-bridge"
import { checkCompetitorMatch, type CompetitorMatchResult } from "./competitor-bridge"
import { generateCopyInspiration, type CopyInspirationResult } from "./copy-inspiration-bridge"

// ─── 类型定义 ──────────────────────────────────────────────────────

export interface VideoProcessingInput {
  videoUrl: string
  source: string
  sourceName?: string
  contextText?: string
  storeConfig?: ContentStoreConfig
  /** 跳过 5b/5c/5d/5e，仅做 5a 文案提取（调试用） */
  skipAiProcessing?: boolean
  /** 跳过 5c 选题提取 */
  skipTopicExtraction?: boolean
  /** 跳过 5d 竞品分析 */
  skipCompetitorCheck?: boolean
  /** 跳过 5e 文案灵感 */
  skipCopyInspiration?: boolean
  /** AIM 用户 ID（5c/5e 需要） */
  userId?: string
}

export interface VideoProcessingResult {
  success: boolean
  recordId?: string
  /** 各步骤结果 */
  extraction?: VideoTextExtractionResult
  aiSummary?: AiSummaryResult
  topicExtraction?: TopicExtractionResult
  competitorMatch?: CompetitorMatchResult
  copyInspiration?: CopyInspirationResult
  error?: string
  durationMs: number
}

export interface AiSummaryResult {
  title: string
  summary: string
  keyPoints: string[]
}

// ─── 环境变量 ──────────────────────────────────────────────────────

function getLlmBaseUrl(): string {
  return process.env.LLM_SUMMARY_BASE_URL?.trim() || "https://api.deepseek.com/v1"
}

function getLlmApiKey(): string {
  const key = process.env.LLM_SUMMARY_API_KEY?.trim()
  if (!key) throw new Error("缺少 LLM_SUMMARY_API_KEY")
  return key
}

function getLlmModel(): string {
  return process.env.LLM_SUMMARY_MODEL?.trim() || "deepseek-chat"
}

// ─── 核心流水线 ─────────────────────────────────────────────────────

/**
 * 处理单个视频链接的完整流水线（5a → 5b → 5c → 5d → 5e → 6）。
 */
export async function processVideo(input: VideoProcessingInput): Promise<VideoProcessingResult> {
  const startTime = Date.now()

  try {
    // ① 验证链接
    const validatedUrl = assertSupportedVideoUrl(input.videoUrl)
    const platform = detectVideoPlatform(validatedUrl)

    // ② 飞书 Base 占位
    const pending = await createPendingContentItem(validatedUrl, input.source, input.storeConfig)
    const recordId = pending.recordId

    // ─── 5a：轻抖 API 文案提取 ────────────────────────────────
    const extraction = await extractVideoTranscript(validatedUrl, platform)

    if (input.skipAiProcessing) {
      // 仅提取模式：写入飞书后直接返回
      await upsertContentItem(
        {
          视频标题: extraction.title || "未知标题",
          原始链接: validatedUrl,
          来源: input.source,
          转录文本: extraction.transcript || "",
          AI总结: "",
          关键要点: "",
          处理状态: "已完成",
          处理时间: new Date().toISOString().slice(0, 10),
        },
        input.storeConfig,
      )
      return {
        success: true,
        recordId,
        extraction,
        durationMs: Date.now() - startTime,
      }
    }

    // ─── 5b：AI 总结生成 ──────────────────────────────────────
    let aiSummary: AiSummaryResult | undefined
    if (extraction.transcript) {
      aiSummary = await generateAiSummary({
        title: extraction.title,
        transcript: extraction.transcript,
        duration: extraction.duration,
        platform,
        contextText: input.contextText,
      })
    }

    // ─── 5c：选题提取 ──────────────────────────────────────────
    let topicExtraction: TopicExtractionResult | undefined
    if (!input.skipTopicExtraction && extraction.transcript) {
      topicExtraction = await extractTopicsFromVideo({
        title: extraction.title,
        transcript: extraction.transcript,
        summary: aiSummary?.summary,
        userId: input.userId || "",
      }).catch(() => ({
        success: false,
        cards: [],
        error: "选题提取异常，已跳过",
      }))
    }

    // ─── 5d：竞品分析标记 ──────────────────────────────────────
    let competitorMatch: CompetitorMatchResult | undefined
    if (!input.skipCompetitorCheck) {
      competitorMatch = await checkCompetitorMatch({
        authorName: extraction.title,
        platform,
        videoUrl: validatedUrl,
        userId: input.userId,
      })
    }

    // ─── 5e：文案灵感生成 ──────────────────────────────────────
    let copyInspiration: CopyInspirationResult | undefined
    if (!input.skipCopyInspiration && extraction.transcript) {
      const bestTopic = topicExtraction?.cards?.[0]
      copyInspiration = await generateCopyInspiration({
        title: extraction.title,
        transcript: extraction.transcript,
        summary: aiSummary?.summary,
        topicTitle: bestTopic?.title,
        topicAngle: bestTopic?.angle,
        platform,
      }).catch(() => ({
        success: false,
        error: "文案灵感生成异常，已跳过",
      }))
    }

    // ─── 6：写入飞书 Base ──────────────────────────────────────
    const now = new Date().toISOString().slice(0, 10)

    // 构建增强版 AI 总结（附加 5c/5d/5e 信息）
    let enhancedSummary = aiSummary?.summary || ""
    if (competitorMatch?.isCompetitor) {
      enhancedSummary += `\n\n⚠️ 竞品标记：${competitorMatch.competitorName}`
    }
    if (copyInspiration?.success && copyInspiration.direction) {
      enhancedSummary += `\n\n💡 文案方向：${copyInspiration.direction}`
    }

    let enhancedKeyPoints = aiSummary?.keyPoints?.join("\n") || ""
    if (copyInspiration?.success && copyInspiration.hook) {
      enhancedKeyPoints += `\n\n开头方向：${copyInspiration.hook}`
    }
    if (copyInspiration?.success && copyInspiration.recommendedPlatform) {
      enhancedKeyPoints += `\n推荐平台：${copyInspiration.recommendedPlatform}`
    }

    const finalRecord: ContentItemRecord = {
      视频标题: aiSummary?.title || extraction.title || "未知标题",
      原始链接: validatedUrl,
      来源: input.source,
      转录文本: extraction.transcript || "",
      AI总结: enhancedSummary,
      关键要点: enhancedKeyPoints,
      处理状态: "已完成",
      处理时间: now,
    }

    const writeResult = await upsertContentItem(finalRecord, input.storeConfig)

    return {
      success: true,
      recordId: writeResult.recordId || recordId,
      extraction,
      aiSummary,
      topicExtraction,
      competitorMatch,
      copyInspiration,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    try {
      await upsertContentItem(
        {
          视频标题: "处理失败",
          原始链接: input.videoUrl,
          来源: input.source,
          转录文本: "",
          AI总结: "",
          关键要点: "",
          处理状态: "失败",
          处理时间: new Date().toISOString().slice(0, 10),
        },
        input.storeConfig,
      )
    } catch {
      // ignore
    }

    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    }
  }
}

// ─── 5a：视频文案提取 ──────────────────────────────────────────

async function extractVideoTranscript(
  url: string,
  platform: string,
): Promise<VideoTextExtractionResult> {
  const provider = getVideoTextProvider(platform)
  const { batchId } = await provider.submitTask(url)

  const MAX_POLLS = 60
  const POLL_INTERVAL_MS = 2000

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS)
    const result = await provider.fetchResult(batchId)
    if (result.status === "completed") return result
    if (result.status === "failed") {
      throw new Error(result.errorMessage || "视频文案提取失败")
    }
  }

  throw new Error("视频文案提取超时，请稍后重试")
}

// ─── 5b：AI 总结生成 ──────────────────────────────────────────

interface AiSummaryInput {
  title?: string
  transcript: string
  duration?: string
  platform: string
  contextText?: string
}

async function generateAiSummary(input: AiSummaryInput): Promise<AiSummaryResult> {
  const baseUrl = getLlmBaseUrl()
  const apiKey = getLlmApiKey()
  const model = getLlmModel()

  const transcript = input.transcript.slice(0, 8000)

  const systemPrompt = `你是一个专业的内容分析助手。用户会给你一段短视频的转录文本，你需要：
1. 生成一个简洁的标题（不超过30字）
2. 写一段200-300字的内容摘要
3. 提取3-5个关键要点

请严格按以下 JSON 格式输出，不要输出其他内容：
{"title": "...", "summary": "...", "key_points": ["...", "...", "..."]}

视频时长：${input.duration || "未知"}
视频平台：${input.platform}
${input.contextText ? `用户附带的描述：${input.contextText}` : ""}`

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AI 总结生成失败: ${response.status} ${text}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  const content = data.choices?.[0]?.message?.content || ""

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      title: input.title || "未知视频",
      summary: content.slice(0, 300),
      keyPoints: [],
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string
      summary?: string
      key_points?: string[]
    }
    return {
      title: parsed.title || input.title || "未知视频",
      summary: parsed.summary || "",
      keyPoints: Array.isArray(parsed.key_points) ? parsed.key_points : [],
    }
  } catch {
    return {
      title: input.title || "未知视频",
      summary: content.slice(0, 300),
      keyPoints: [],
    }
  }
}

// ─── 辅助函数 ──────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
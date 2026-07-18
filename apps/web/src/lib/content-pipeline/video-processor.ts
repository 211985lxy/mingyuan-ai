/**
 * 视频内容处理流水线
 *
 * 编排视频从"链接检测"到"飞书存储"的完整处理流程。
 * 两条路由（抖音群 / 视频号）共享此流水线。
 *
 * 处理步骤：
 *   1. 视频文案提取（轻抖 API / channelsProvider）
 *   2. AI 总结生成（LLM Provider 链）
 *   3. 选题提取（AIM TopicSelection）
 *   4. 竞品分析标记（AIM WatchAccount 匹配）
 *   5. 文案灵感生成（content_producer）
 *   6. 结果写入飞书 Base
 */

import {
  assertSupportedVideoUrl,
  detectVideoPlatform,
  formatVideoTextExtractionError,
} from "@/lib/video-text-extractor"
import { getVideoTextProvider } from "@/lib/video-text-providers"
import type { VideoTextExtractionResult } from "@/lib/video-text-extractor"
import {
  upsertContentItem,
  createPendingContentItem,
  type ContentItemRecord,
  type ContentStoreConfig,
} from "./lark-content-store"
import { detectVideoLinks, type DetectedVideoLink } from "./video-link-detector"

// ─── 类型定义 ──────────────────────────────────────────────────────

export interface VideoProcessingInput {
  /** 视频原始链接 */
  videoUrl: string
  /** 来源标识："抖音群" 或 "视频号" */
  source: string
  /** 来源群名或公众号名（可选） */
  sourceName?: string
  /** 消息文本中除了链接之外的文字（可选，可辅助上下文） */
  contextText?: string
  /** 飞书 Store 配置（可选，默认从环境变量读取） */
  storeConfig?: ContentStoreConfig
  /** 跳过 AI 处理步骤（仅提取文案，用于调试） */
  skipAiProcessing?: boolean
}

export interface VideoProcessingResult {
  /** 是否成功 */
  success: boolean
  /** 飞书 Base 记录 ID */
  recordId?: string
  /** 各步骤的处理结果 */
  extraction?: VideoTextExtractionResult
  aiSummary?: AiSummaryResult
  /** 失败时的错误信息 */
  error?: string
  /** 处理耗时（毫秒） */
  durationMs: number
}

export interface AiSummaryResult {
  /** AI 生成的标题（≤30字） */
  title: string
  /** AI 摘要（200-300字） */
  summary: string
  /** 关键要点（3-5条） */
  keyPoints: string[]
}

// ─── 环境变量 ──────────────────────────────────────────────────────

function getLlmApiKey(): string {
  const key = process.env.LLM_SUMMARY_API_KEY?.trim()
  if (!key) throw new Error("缺少 LLM_SUMMARY_API_KEY，视频总结需要配置 LLM 密钥")
  return key
}

function getLlmBaseUrl(): string {
  return process.env.LLM_SUMMARY_BASE_URL?.trim() || "https://api.openai.com/v1"
}

function getLlmModel(): string {
  return process.env.LLM_SUMMARY_MODEL?.trim() || "deepseek-chat"
}

// ─── 核心流水线 ─────────────────────────────────────────────────────

/**
 * 处理单个视频链接的完整流水线。
 * 此函数是两条路由的合流点。
 */
export async function processVideo(input: VideoProcessingInput): Promise<VideoProcessingResult> {
  const startTime = Date.now()

  try {
    // ① 验证链接
    const validatedUrl = assertSupportedVideoUrl(input.videoUrl)
    const platform = detectVideoPlatform(validatedUrl)

    // ② 先在飞书 Base 占位（状态：待处理）
    const pending = await createPendingContentItem(validatedUrl, input.source, input.storeConfig)
    const recordId = pending.recordId

    // ③ 调用轻抖/channelsProvider 提取文案
    const extraction = await extractVideoTranscript(validatedUrl, platform)

    // ④ AI 总结
    let aiSummary: AiSummaryResult | undefined
    if (!input.skipAiProcessing && extraction.transcript) {
      aiSummary = await generateAiSummary({
        title: extraction.title,
        transcript: extraction.transcript,
        duration: extraction.duration,
        platform,
        contextText: input.contextText,
      })
    }

    // ⑤ 写入飞书 Base（状态：已完成）
    const now = new Date().toISOString().slice(0, 10)
    const finalRecord: ContentItemRecord = {
      视频标题: aiSummary?.title || extraction.title || "未知标题",
      原始链接: validatedUrl,
      来源: input.source,
      转录文本: extraction.transcript || "",
      AI总结: aiSummary?.summary || "",
      关键要点: aiSummary?.keyPoints.join("\n") || "",
      处理状态: "已完成",
      处理时间: now,
    }

    const writeResult = await upsertContentItem(finalRecord, input.storeConfig)

    return {
      success: true,
      recordId: writeResult.recordId || recordId,
      extraction,
      aiSummary,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // 尝试更新飞书 Base 状态为"失败"
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
      // 写入失败状态也失败时忽略
    }

    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    }
  }
}

// ─── 步骤 3：视频文案提取 ──────────────────────────────────────────

/**
 * 调用对应平台的 Provider 提取视频文案。
 * 使用提交→轮询模式，最多轮询 60 次（约 2 分钟）。
 */
async function extractVideoTranscript(
  url: string,
  platform: string,
): Promise<VideoTextExtractionResult> {
  const provider = getVideoTextProvider(platform)

  // 提交任务
  const { batchId } = await provider.submitTask(url)

  // 轮询结果（每次间隔 2s，最多 60 次 = 2 分钟）
  const MAX_POLLS = 60
  const POLL_INTERVAL_MS = 2000

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS)
    const result = await provider.fetchResult(batchId)

    if (result.status === "completed") return result
    if (result.status === "failed") {
      throw new Error(result.errorMessage || "视频文案提取失败")
    }
    // status === "extracting"，继续轮询
  }

  throw new Error("视频文案提取超时，请稍后重试")
}

// ─── 步骤 4：AI 总结生成 ──────────────────────────────────────────

interface AiSummaryInput {
  title?: string
  transcript: string
  duration?: string
  platform: string
  contextText?: string
}

/**
 * 调用 LLM 生成视频的 AI 总结。
 * 复用 AIM 的 OpenAI 兼容接口模式。
 */
async function generateAiSummary(input: AiSummaryInput): Promise<AiSummaryResult> {
  const baseUrl = getLlmBaseUrl()
  const apiKey = getLlmApiKey()
  const model = getLlmModel()

  // 截取转录文本（避免超出上下文窗口）
  const maxTranscriptLength = 8000
  const transcript = input.transcript.slice(0, maxTranscriptLength)

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

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>
  }
  const content = data.choices?.[0]?.message?.content || ""

  // 解析 JSON（容忍 Markdown 代码块包裹）
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    // 解析失败时返回基本信息
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

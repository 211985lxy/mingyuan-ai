/**
 * 5c 选题提取桥接模块
 *
 * 将视频转录文本适配为 AIM 选题引擎的输入格式：
 *   transcript → topicSources → generateTopicCards() → TopicSelection DB
 */

import { prisma } from "@/lib/prisma"
import { generateTopicCards } from "@/lib/topic-generation"
import type { TopicCard } from "@/lib/topic-validation"

// ─── 类型定义 ──────────────────────────────────────────────────────

export interface TopicExtractionResult {
  /** 是否成功 */
  success: boolean
  /** 生成的选题卡片 */
  cards: TopicCard[]
  /** 使用的推导策略 */
  strategy?: string
  /** 选型记录 ID（写入 DB 后） */
  topicSelectionId?: string
  /** 错误信息 */
  error?: string
}

export interface TopicExtractionInput {
  /** 视频标题 */
  title?: string
  /** 转录文本 */
  transcript: string
  /** AI 摘要（可选，辅助选题上下文） */
  summary?: string
  /** AIM 用户 ID（必须，用于加载 IP Profile 和存 DB） */
  userId: string
  /** 推荐模式 */
  mode?: "normal" | "daily" | "weekly"
}

// ─── 环境变量 ──────────────────────────────────────────────────────

/** 流水线默认用户 ID（飞书/公众号消息无 session 时使用） */
function getPipelineUserId(): string {
  return process.env.CONTENT_PIPELINE_USER_ID?.trim() || ""
}

// ─── 核心函数 ──────────────────────────────────────────────────────

/**
 * 从视频转录文本中提取选题方向，写入 TopicSelection。
 *
 * 适配逻辑：
 *   1. 加载用户的 IP Profile 和已发布的 TopicElement
 *   2. 将转录文本包装为 topicSource（category: "benchmark_reference"）
 *   3. 调用 generateTopicCards() 生成 4 个选题卡片
 *   4. 将结果持久化到 TopicSelection 表
 */
export async function extractTopicsFromVideo(
  input: TopicExtractionInput,
): Promise<TopicExtractionResult> {
  const userId = input.userId || getPipelineUserId()

  try {
    // 1. 加载 IP Profile
    const ipProfile = await prisma.ipProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        displayName: true,
        nickname: true,
        industry: true,
        primaryOffer: true,
        targetAudience: true,
        ipTraits: true,
        toneOfVoice: true,
        proofPoints: true,
        callToAction: true,
        profileVersion: true,
      },
    })

    if (!ipProfile) {
      return { success: false, cards: [], error: "未找到用户 IP 定位，无法生成选题" }
    }

    // 2. 加载已发布的营销元素
    const elements = await prisma.topicElement.findMany({
      where: { status: "published" },
      select: { code: true, name: true, typeLabel: true, description: true },
    })

    if (elements.length === 0) {
      return { success: false, cards: [], error: "未配置营销元素，请在管理后台添加" }
    }

    // 3. 将转录文本包装为 topicSource
    const sourceContent = input.summary
      ? `## 视频摘要\n${input.summary}\n\n## 完整转录\n${input.transcript.slice(0, 5000)}`
      : input.transcript.slice(0, 5000)

    const topicSources = [
      {
        category: "benchmark_reference",
        title: input.title || "视频素材",
        content: sourceContent,
      },
    ]

    // 4. 调用选题引擎
    const result = await generateTopicCards({
      ipProfile,
      elements,
      topicSources,
      recommendationMode: input.mode || "normal",
    })

    if (!result.success) {
      return { success: false, cards: [], error: result.error }
    }

    // 5. 持久化到 TopicSelection
    const selection = await prisma.topicSelection.create({
      data: {
        userId,
        ipProfileId: ipProfile.id,
        elementCodes: result.elementCodes,
        candidates: result.cards,
        selectedIndex: null,
        promptText: result.promptText,
        model: result.model,
        status: "pending",
        recommendationMode: input.mode || "normal",
        recommendedDate: new Date().toISOString().slice(0, 10),
      },
    })

    return {
      success: true,
      cards: result.cards,
      strategy: result.strategy,
      topicSelectionId: selection.id,
    }
  } catch (error) {
    return {
      success: false,
      cards: [],
      error: error instanceof Error ? error.message : "选题提取失败",
    }
  }
}
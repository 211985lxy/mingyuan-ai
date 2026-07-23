"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import { capTopicKnowledgeEntryIds } from "@/features/topics/contracts/api"
import type { HotTopic } from "@/types/content-template"
import type { StyleGuideId } from "@/lib/style-guide-config"
import type {
  ApiAsset, ApiContentGenerationRun, ApiHotTopicFit, ApiHotTopicInsight,
  ApiTopicRecommendationMode, ApiScript, ApiUser,
  ApiVideoStructure,
  AuthResponse,
  HotTopicsResponse, PaginatedResponse,
  PublicTemplateDetail, PublicTemplateListItem, ApiTopicGenerateResponse, ApiTopicSelectResponse,
  ApiOpeningType, ApiCopyStructure, ApiEndingType, ApiCompetitorAnalysis,
  CompetitorReportsResponse, ApiCompetitorWebResearch, ApiAccountHotSources,
  ApiAiHotBriefing, ApiHotDecisionResponse, ApiHotDecisionSource, ApiMarketHotSnapshot,
  ApiVideoCopyExtraction, ApiAgentApiKeySummary, ApiTopicCard,
} from "@/types/api"

export const TOPIC_GENERATE_TIMEOUT_MS = 180000

/**
 * @description 生成topics
 * @param input? - input?
 * @returns Promise<ApiTopicGenerateResponse>
 */
export async function generateTopics(
  input?: {
    projectId?: string
    knowledgeEntryIds?: string[]
    elementCodes?: string[]
    refreshCount?: number
    recommendationMode?: ApiTopicRecommendationMode
  },
): Promise<ApiTopicGenerateResponse> {
  const body: Record<string, unknown> = {}
  if (input?.projectId) body.projectId = input.projectId
  const knowledgeEntryIds = capTopicKnowledgeEntryIds(input?.knowledgeEntryIds)
  if (knowledgeEntryIds?.length) body.knowledgeEntryIds = knowledgeEntryIds
  if (input?.elementCodes) body.elementCodes = input.elementCodes
  if (typeof input?.refreshCount === "number") body.refreshCount = input.refreshCount
  if (input?.recommendationMode) body.recommendationMode = input.recommendationMode
  const payload = await request<{ data: ApiTopicGenerateResponse }>(
    "/api/topics/generate",
    {
      method: "POST",
      body: JSON.stringify(body),
      timeout: TOPIC_GENERATE_TIMEOUT_MS,
    }
  )
  return payload.data
}

export type TopicChatResponse = {
  classification: { category: string; reason: string }
  knowledgeEntry: { id: string; category: string; title: string }
  topicSelectionId: string
  cards: ApiTopicCard[]
  reply: {
    summary: string
    recommendedTitle: string
    opening: string
    alternatives: string[]
    nextActionLabel: string
  }
}

/**
 * @description 发送topicchatmessage
 * @param input - 输入数据
 * @returns Promise<TopicChatResponse>
 */
export async function sendTopicChatMessage(input: {
  projectId: string
  content: string
}): Promise<TopicChatResponse> {
  return request<TopicChatResponse>("/api/topics/chat", {
    method: "POST",
    body: JSON.stringify(input),
    timeout: 60000,
  })
}

/**
 * @description 选择topic
 * @param topicSelectionId - 主题Selection唯一标识符
 * @param selectedIndex - selected索引
 * @returns Promise<ApiTopicSelectResponse>
 */
export async function selectTopic(
  topicSelectionId: string,
  selectedIndex: number
): Promise<ApiTopicSelectResponse> {
  const payload = await request<{ data: ApiTopicSelectResponse }>(
    `/api/topics/${topicSelectionId}/select`,
    {
      method: "POST",
      body: JSON.stringify({ selectedIndex }),
    }
  )
  return payload.data
}

/**
 * @description 列出openingtypes
 * @returns Promise<ApiOpeningType[]>
 */
export async function listOpeningTypes(): Promise<ApiOpeningType[]> {
  const payload = await request<{ data: ApiOpeningType[] }>("/api/topics/opening-types")
  return payload.data
}

/**
 * @description 列出copystructures
 * @returns Promise<ApiCopyStructure[]>
 */
export async function listCopyStructures(): Promise<ApiCopyStructure[]> {
  const payload = await request<{ data: ApiCopyStructure[] }>("/api/topics/copy-structures")
  return payload.data
}

/**
 * @description 列出endingtypes
 * @returns Promise<ApiEndingType[]>
 */
export async function listEndingTypes(): Promise<ApiEndingType[]> {
  const payload = await request<{ data: ApiEndingType[] }>("/api/topics/ending-types")
  return payload.data
}

// ─── Today Topics Cache ─────────────────────────────────

export interface TodayTopicsResult {
  mode: "cached" | "missing"
  topicSelectionId?: string
  cards?: ApiTopicCard[]
  sourceHighlights?: Array<{
    category: string
    title: string
    content: string
  }>
  createdAt?: string
}

/**
 * @description 获取todaytopics
 * @param mode - 众数
 * @returns Promise<TodayTopicsResult>
 */
export async function getTodayTopics(mode: ApiTopicRecommendationMode = "daily"): Promise<TodayTopicsResult> {
  const qs = mode !== "normal" ? `?mode=${mode}` : ""
  return request<TodayTopicsResult>(`/api/topics/today${qs}`)
}

// ─── Competitor Analysis (v5.0) ──────────────────────────

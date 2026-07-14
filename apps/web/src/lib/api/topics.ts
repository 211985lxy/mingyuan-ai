"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import type { HotTopic } from "@/types/content-template"
import type { StyleGuideId } from "@/lib/style-guide-config"
import type {
  ApiAsset, ApiAvatar, ApiContentGenerationRun, ApiHotTopicFit, ApiHotTopicInsight,
  ApiTopicRecommendationMode, ApiPublicAssetVoice, ApiPublicVirtualman,
  ApiPublicAvatarPreviewDefaults, ApiPublicAvatarPreview, ApiScript, ApiUser,
  ApiVideoTask, ApiVideoPackagingTemplate, ApiVideoProductionPlan, ApiVideoStructure,
  AuthResponse, ApiPackagingRecommendationContext, BackgroundMusicSelection,
  MaterialAssignment, HotTopicsResponse, PaginatedResponse, PackagingMaterialSuggestionsResponse,
  PublicTemplateDetail, PublicTemplateListItem, ApiTopicGenerateResponse, ApiTopicSelectResponse,
  ApiOpeningType, ApiCopyStructure, ApiEndingType, ApiCompetitorAnalysis,
  CompetitorReportsResponse, ApiCompetitorWebResearch, ApiAccountHotSources,
  ApiAiHotBriefing, ApiHotDecisionResponse, ApiHotDecisionSource, ApiMarketHotSnapshot,
  ApiVideoCopyExtraction, ApiAgentApiKeySummary, ApiTopicCard,
} from "@/types/api"

export const TOPIC_GENERATE_TIMEOUT_MS = 180000

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
  if (input?.knowledgeEntryIds?.length) body.knowledgeEntryIds = input.knowledgeEntryIds
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

export async function listOpeningTypes(): Promise<ApiOpeningType[]> {
  const payload = await request<{ data: ApiOpeningType[] }>("/api/topics/opening-types")
  return payload.data
}

export async function listCopyStructures(): Promise<ApiCopyStructure[]> {
  const payload = await request<{ data: ApiCopyStructure[] }>("/api/topics/copy-structures")
  return payload.data
}

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

export async function getTodayTopics(mode: ApiTopicRecommendationMode = "daily"): Promise<TodayTopicsResult> {
  const qs = mode !== "normal" ? `?mode=${mode}` : ""
  return request<TodayTopicsResult>(`/api/topics/today${qs}`)
}

// ─── Competitor Analysis (v5.0) ──────────────────────────

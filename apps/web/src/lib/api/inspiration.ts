"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import type { AimGenerateResponse } from "./aim"
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

export interface InspirationItem {
  id: string
  userId: string
  source: string
  content: string
  aiStatus: string
  generatedTopics: Array<{ title: string; rationale: string }> | null
  generatedContent: AimGenerateResponse | null
  aimGenerationId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export async function listInspirations(status?: string): Promise<{ items: InspirationItem[] }> {
  const params = new URLSearchParams()
  if (status) params.set("status", status)
  return request<{ items: InspirationItem[] }>(`/api/inspiration?${params}`)
}

export async function createInspiration(data: {
  content: string
  source?: string
  autoProcess?: boolean
}): Promise<InspirationItem> {
  return request<InspirationItem>("/api/inspiration", {
    method: "POST",
    body: JSON.stringify(data),
    timeout: 5000,
  })
}

export async function processInspiration(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/inspiration/${id}/process`, {
    method: "POST",
  })
}

export async function generateFromInspiration(
  id: string,
  data: { projectId: string; topicTitle?: string }
): Promise<AimGenerateResponse> {
  return request<AimGenerateResponse>(`/api/inspiration/${id}/generate`, {
    method: "POST",
    body: JSON.stringify(data),
    timeout: 60000,
  })
}

"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
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

export async function listHotTopics(input?: { source?: string }): Promise<HotTopicsResponse> {
  const url = input?.source ? `/api/hot-topics?source=${encodeURIComponent(input.source)}` : "/api/hot-topics"
  const payload = await request<{ data: HotTopicsResponse }>(url, {
    auth: false,
  })
  return payload.data
}

export async function getTodayAiHotBriefing(input?: { accountEmail?: string }): Promise<ApiAiHotBriefing> {
  const query = input?.accountEmail ? `?accountEmail=${encodeURIComponent(input.accountEmail)}` : ""
  const payload = await request<{ data: ApiAiHotBriefing }>(`/api/aihot-briefing/today${query}`)
  return payload.data
}

export async function refreshTodayAiHotBriefing(): Promise<ApiAiHotBriefing> {
  const payload = await request<{ data: ApiAiHotBriefing }>("/api/aihot-briefing/today/refresh", {
    method: "POST",
  })
  return payload.data
}

export async function getMarketHotSnapshot(): Promise<ApiMarketHotSnapshot> {
  const payload = await request<{ data: ApiMarketHotSnapshot }>("/api/market-insights/last30days/hotlist")
  return payload.data
}

export async function refreshMarketHotSnapshot(): Promise<ApiMarketHotSnapshot> {
  const payload = await request<{ data: ApiMarketHotSnapshot }>("/api/market-insights/last30days/hotlist/refresh", {
    method: "POST",
  })
  return payload.data
}

export async function getHotDecisions(source: ApiHotDecisionSource): Promise<ApiHotDecisionResponse> {
  const payload = await request<{ data: ApiHotDecisionResponse }>(`/api/hot-decisions?source=${encodeURIComponent(source)}`, {
    auth: false,
  })
  return payload.data
}

export async function refreshHotDecisions(source: ApiHotDecisionSource): Promise<ApiHotDecisionResponse> {
  const payload = await request<{ data: ApiHotDecisionResponse }>(`/api/hot-decisions/refresh?source=${encodeURIComponent(source)}`, {
    method: "POST",
  })
  return payload.data
}


export async function getHotTopicInsight(input: {
  topicId: string
}): Promise<{ topic: HotTopic; insight: ApiHotTopicInsight }> {
  const payload = await request<{
    data: { topic: HotTopic; insight: ApiHotTopicInsight }
  }>(`/api/hot-topics/${encodeURIComponent(input.topicId)}/insight`)
  return payload.data
}

export async function getHotTopicFit(input: {
  topicId: string
  templateId: string
  structureId: string
  inputs: Record<string, string>
}): Promise<{
  topic: HotTopic
  insight: ApiHotTopicInsight
  fit: ApiHotTopicFit
}> {
  const payload = await request<{
    data: {
      topic: HotTopic
      insight: ApiHotTopicInsight
      fit: ApiHotTopicFit
    }
  }>(`/api/hot-topics/${encodeURIComponent(input.topicId)}/fit`, {
    method: "POST",
    body: JSON.stringify({
      templateId: input.templateId,
      structureId: input.structureId,
      inputs: input.inputs,
    }),
  })
  return payload.data
}

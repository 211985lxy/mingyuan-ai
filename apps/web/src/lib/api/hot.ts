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

/**
 * @description 列出hottopics
 * @param input? - input?
 * @returns Promise<HotTopicsResponse>
 */
export async function listHotTopics(input?: { source?: string }): Promise<HotTopicsResponse> {
  const url = input?.source ? `/api/hot-topics?source=${encodeURIComponent(input.source)}` : "/api/hot-topics"
  const payload = await request<{ data: HotTopicsResponse }>(url, {
    auth: false,
  })
  return payload.data
}

/**
 * @description 获取todayaihotbriefing
 * @param input? - input?
 * @returns Promise<ApiAiHotBriefing>
 */
export async function getTodayAiHotBriefing(input?: { accountEmail?: string }): Promise<ApiAiHotBriefing> {
  const query = input?.accountEmail ? `?accountEmail=${encodeURIComponent(input.accountEmail)}` : ""
  const payload = await request<{ data: ApiAiHotBriefing }>(`/api/aihot-briefing/today${query}`)
  return payload.data
}

/**
 * @description 刷新todayaihotbriefing
 * @returns Promise<ApiAiHotBriefing>
 */
export async function refreshTodayAiHotBriefing(): Promise<ApiAiHotBriefing> {
  const payload = await request<{ data: ApiAiHotBriefing }>("/api/aihot-briefing/today/refresh", {
    method: "POST",
  })
  return payload.data
}

/**
 * @description 获取markethotsnapshot
 * @returns Promise<ApiMarketHotSnapshot>
 */
export async function getMarketHotSnapshot(): Promise<ApiMarketHotSnapshot> {
  const payload = await request<{ data: ApiMarketHotSnapshot }>("/api/market-insights/last30days/hotlist")
  return payload.data
}

/**
 * @description 刷新markethotsnapshot
 * @returns Promise<ApiMarketHotSnapshot>
 */
export async function refreshMarketHotSnapshot(): Promise<ApiMarketHotSnapshot> {
  const payload = await request<{ data: ApiMarketHotSnapshot }>("/api/market-insights/last30days/hotlist/refresh", {
    method: "POST",
  })
  return payload.data
}

/**
 * @description 获取hotdecisions
 * @param source - 来源
 * @returns Promise<ApiHotDecisionResponse>
 */
export async function getHotDecisions(source: ApiHotDecisionSource): Promise<ApiHotDecisionResponse> {
  const payload = await request<{ data: ApiHotDecisionResponse }>(`/api/hot-decisions?source=${encodeURIComponent(source)}`, {
    auth: false,
  })
  return payload.data
}

/**
 * @description 刷新hotdecisions
 * @param source - 来源
 * @returns Promise<ApiHotDecisionResponse>
 */
export async function refreshHotDecisions(source: ApiHotDecisionSource): Promise<ApiHotDecisionResponse> {
  const payload = await request<{ data: ApiHotDecisionResponse }>(`/api/hot-decisions/refresh?source=${encodeURIComponent(source)}`, {
    method: "POST",
  })
  return payload.data
}


/**
 * @description 获取hottopicinsight
 * @param input - 输入数据
 * @returns Promise<
 */
export async function getHotTopicInsight(input: {
  topicId: string
}): Promise<{ topic: HotTopic; insight: ApiHotTopicInsight }> {
  const payload = await request<{
    data: { topic: HotTopic; insight: ApiHotTopicInsight }
  }>(`/api/hot-topics/${encodeURIComponent(input.topicId)}/insight`)
  return payload.data
}

/**
 * @description 获取hottopicfit
 * @param input - 输入数据
 * @returns Promise<
 */
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

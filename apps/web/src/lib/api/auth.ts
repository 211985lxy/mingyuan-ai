"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import { getStoredAuthToken } from "@/lib/auth-storage"
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

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export async function registerUser(input: {
  email: string
  password: string
  name: string
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    auth: false,
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function getCurrentUser(): Promise<ApiUser> {
  const payload = await request<{ user: ApiUser }>("/api/auth/me")
  return payload.user
}

export async function listAgentApiKeys(): Promise<ApiAgentApiKeySummary[]> {
  const payload = await request<{ items: ApiAgentApiKeySummary[] }>("/api/account/agent-keys")
  return payload.items
}

export async function getAccountHotSources(): Promise<ApiAccountHotSources> {
  const payload = await request<{ data: ApiAccountHotSources }>("/api/account/hot-sources")
  return payload.data
}

export async function activateUser(code: string): Promise<ApiUser> {
  const payload = await request<{ user: ApiUser }>("/api/auth/activate", {
    method: "POST",
    body: JSON.stringify({ code }),
  })
  return payload.user
}

export async function saveAuthVideo(authVideoUrl: string): Promise<ApiUser> {
  const payload = await request<{ user: ApiUser }>("/api/auth/auth-video", {
    method: "POST",
    body: JSON.stringify({ authVideoUrl }),
  })
  return payload.user
}



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

export async function startCompetitorAnalysis(url: string): Promise<{
  id: string
  status: string
  platform: string
}> {
  return request<{ id: string; status: string; platform: string }>(
    "/api/competitor/analyze",
    {
      method: "POST",
      body: JSON.stringify({ url }),
      timeout: 10000,
    }
  )
}

export async function getCompetitorAnalysis(id: string): Promise<ApiCompetitorAnalysis> {
  return request<ApiCompetitorAnalysis>(`/api/competitor/${id}`)
}

export function buildCompetitorReportsPath(page = 1, limit = 10, targetUrl?: string): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (targetUrl) params.set("targetUrl", targetUrl)
  return `/api/competitor/reports?${params.toString()}`
}

export async function listCompetitorReports(
  page = 1,
  limit = 10,
  targetUrl?: string
): Promise<CompetitorReportsResponse> {
  return request<CompetitorReportsResponse>(
    buildCompetitorReportsPath(page, limit, targetUrl)
  )
}

export async function deleteCompetitorAnalysis(id: string): Promise<void> {
  await request(`/api/competitor/${id}`, { method: "DELETE" })
}

export async function runCompetitorWebResearch(query: string): Promise<ApiCompetitorWebResearch> {
  const payload = await request<{ data: ApiCompetitorWebResearch }>("/api/competitor/web-research", {
    method: "POST",
    body: JSON.stringify({ query }),
    timeout: 30000,
  })
  return payload.data
}

// ─── Watch Accounts（对标账号分析） ────────────────────

export interface WatchAccount {
  id: string
  targetUrl: string
  platform: string
  platformUserId: string | null
  nickname: string | null
  avatar: string | null
  followerCount: number | null
  latestVideos: Array<{
    videoId: string
    title: string
    coverUrl: string
    videoUrl?: string
    createTime: number
    views: number
    likes: number
    comments: number
    shares: number
    collects: number
  }> | null
  viralVideos: Array<{
    videoId: string
    title: string
    coverUrl: string
    videoUrl?: string
    createTime: number
    views: number
    likes: number
    comments: number
    shares: number
    collects: number
    engagementScore: number
  }> | null
  refreshStatus: string
  refreshError: string | null
  lastRefreshedAt: string | null
  createdAt: string
}

export interface WatchAccountsResponse {
  items: WatchAccount[]
}

export interface WatchRefreshResponse {
  results: Array<{ id: string; targetUrl: string; status: string; error?: string }>
  summary: { total: number; success: number; failed: number }
}

export type WatchVideoRecommendationCategory =
  | "问题解答"
  | "人设故事"
  | "客户案例"
  | "观点判断"
  | "方法清单"
  | "待判断"

export interface WatchVideoRecommendation {
  id: string
  watchAccountId: string
  accountName: string
  accountUrl: string
  platform: string
  videoId: string
  videoUrl: string
  title: string
  coverUrl: string
  createTime: number
  metrics: {
    views: number
    likes: number
    comments: number
    shares: number
    collects: number
    engagementScore: number
  }
  category: WatchVideoRecommendationCategory
  score: number
  recommendationReason: string
  migrationAngle: string
  suggestedHook: string
  suggestedCta: string
  source: "viral" | "latest"
  lastRefreshedAt: string | null
}

export interface WatchVideoRecommendationsResponse {
  items: WatchVideoRecommendation[]
  generatedAt: string
  sourceSummary: {
    accountCount: number
    videoCount: number
  }
}

export interface SimilarAccountVideo {
  title: string
  coverUrl: string
  videoUrl: string
  createTime: string
  likes: number
  comments: number
  shares: number
  views: number
  interactiveCount: number
}

export interface SimilarAccount {
  nickname: string
  avatar: string
  targetUrl: string
  platformUserId: string
  followerCount: number
  redfoxScore: number | null
  reason: string
  recentVideos: SimilarAccountVideo[]
}

export interface SimilarAccountDiscovery {
  currentAccount: SimilarAccount | null
  peerAccounts: SimilarAccount[]
  leaderAccounts: SimilarAccount[]
}

export async function listWatchAccounts(): Promise<WatchAccountsResponse> {
  return request<WatchAccountsResponse>(
    "/api/competitor/watch-accounts"
  )
}

export async function addWatchAccount(url: string): Promise<WatchAccount> {
  return request<WatchAccount>("/api/competitor/watch-accounts", {
    method: "POST",
    body: JSON.stringify({ url }),
    timeout: 10000,
  })
}

export async function discoverSimilarAccounts(targetUrl: string): Promise<SimilarAccountDiscovery> {
  return request<SimilarAccountDiscovery>("/api/competitor/discover-similar", {
    method: "POST",
    body: JSON.stringify({ targetUrl }),
    timeout: 60000,
  })
}

export async function deleteWatchAccount(id: string): Promise<void> {
  await request(`/api/competitor/watch-accounts/${id}`, { method: "DELETE" })
}

export async function refreshWatchAccounts(accountId?: string): Promise<WatchRefreshResponse> {
  return request<WatchRefreshResponse>("/api/competitor/watch-accounts/refresh", {
    method: "POST",
    body: JSON.stringify(accountId ? { accountId } : {}),
    timeout: 300000,
  })
}

export async function recommendWatchAccountVideos(input?: {
  projectId?: string
  intent?: string
  categories?: WatchVideoRecommendationCategory[]
  limit?: number
}): Promise<WatchVideoRecommendationsResponse> {
  const payload = await request<{ data: WatchVideoRecommendationsResponse }>(
    "/api/competitor/watch-accounts/recommendations",
    {
      method: "POST",
      body: JSON.stringify(input ?? {}),
      timeout: 20000,
    },
  )
  return payload.data
}

export async function extractWatchAccountVideo(input: {
  watchAccountId: string
  videoUrl: string
  videoTitle?: string
  coverUrl?: string
}): Promise<ApiVideoCopyExtraction> {
  return request<ApiVideoCopyExtraction>("/api/competitor/watch-accounts/videos/extract", {
    method: "POST",
    body: JSON.stringify(input),
    timeout: 20000,
  })
}

// ─── Video Copy Extraction（爆款文案拆解） ───────────────

export async function listVideoCopyExtractions(): Promise<{ items: ApiVideoCopyExtraction[] }> {
  return request<{ items: ApiVideoCopyExtraction[] }>("/api/video-copy-extractions")
}

export async function createVideoCopyExtraction(url: string): Promise<ApiVideoCopyExtraction> {
  return request<ApiVideoCopyExtraction>("/api/video-copy-extractions", {
    method: "POST",
    body: JSON.stringify({ url }),
    timeout: 20000,
  })
}

export async function getVideoCopyExtraction(id: string): Promise<ApiVideoCopyExtraction> {
  return request<ApiVideoCopyExtraction>(`/api/video-copy-extractions/${id}`)
}

export async function syncVideoCopyExtraction(id: string): Promise<ApiVideoCopyExtraction> {
  return request<ApiVideoCopyExtraction>(`/api/video-copy-extractions/${id}/sync`, {
    method: "POST",
    body: JSON.stringify({}),
    timeout: 120000,
  })
}

export interface TopCommentEntry {
  text: string
  likes: number
  isTop: boolean
}

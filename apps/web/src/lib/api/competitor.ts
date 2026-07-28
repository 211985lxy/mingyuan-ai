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
 * @description 启动competitoranalysis
 * @param url - URL 地址
 * @returns Promise<
 */
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

/**
 * @description 获取competitoranalysis
 * @param id - 唯一标识符
 * @returns Promise<ApiCompetitorAnalysis>
 */
export async function getCompetitorAnalysis(id: string): Promise<ApiCompetitorAnalysis> {
  return request<ApiCompetitorAnalysis>(`/api/competitor/${id}`)
}

/**
 * @description 构建competitorreportspath
 * @param page - 页码
 * @param limit - 极限
 * @param targetUrl? - 目标Url?
 * @returns string
 */
export function buildCompetitorReportsPath(page = 1, limit = 10, targetUrl?: string): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (targetUrl) params.set("targetUrl", targetUrl)
  return `/api/competitor/reports?${params.toString()}`
}

/**
 * @description 列出competitorreports
 * @param page - 页码
 * @param limit - 极限
 * @param targetUrl? - 目标Url?
 * @returns Promise<CompetitorReportsResponse>
 */
export async function listCompetitorReports(
  page = 1,
  limit = 10,
  targetUrl?: string
): Promise<CompetitorReportsResponse> {
  return request<CompetitorReportsResponse>(
    buildCompetitorReportsPath(page, limit, targetUrl)
  )
}

/**
 * @description 删除competitoranalysis
 * @param id - 唯一标识符
 * @returns Promise<void>
 */
export async function deleteCompetitorAnalysis(id: string): Promise<void> {
  await request(`/api/competitor/${id}`, { method: "DELETE" })
}

/**
 * @description 运行competitorwebresearch
 * @param query - 查询条件
 * @returns Promise<ApiCompetitorWebResearch>
 */
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

/**
 * @description 列出watchaccounts
 * @returns Promise<WatchAccountsResponse>
 */
export async function listWatchAccounts(): Promise<WatchAccountsResponse> {
  return request<WatchAccountsResponse>(
    "/api/competitor/watch-accounts"
  )
}

/**
 * @description 添加watchaccount
 * @param url - URL 地址
 * @returns Promise<WatchAccount>
 */
export async function addWatchAccount(url: string): Promise<WatchAccount> {
  return request<WatchAccount>("/api/competitor/watch-accounts", {
    method: "POST",
    body: JSON.stringify({ url }),
    timeout: 10000,
  })
}

/**
 * @description discoversimilaraccounts
 * @param targetUrl - 目标URL 地址
 * @returns Promise<SimilarAccountDiscovery>
 */
export async function discoverSimilarAccounts(targetUrl: string): Promise<SimilarAccountDiscovery> {
  return request<SimilarAccountDiscovery>("/api/competitor/discover-similar", {
    method: "POST",
    body: JSON.stringify({ targetUrl }),
    timeout: 60000,
  })
}

/**
 * @description 删除watchaccount
 * @param id - 唯一标识符
 * @returns Promise<void>
 */
export async function deleteWatchAccount(id: string): Promise<void> {
  await request(`/api/competitor/watch-accounts/${id}`, { method: "DELETE" })
}

/**
 * @description 刷新watchaccounts
 * @param accountId? - 账户Id?
 * @returns Promise<WatchRefreshResponse>
 */
export async function refreshWatchAccounts(accountId?: string): Promise<WatchRefreshResponse> {
  return request<WatchRefreshResponse>("/api/competitor/watch-accounts/refresh", {
    method: "POST",
    body: JSON.stringify(accountId ? { accountId } : {}),
    timeout: 300000,
  })
}

/**
 * @description recommendwatchaccountvideos
 * @param input? - input?
 * @returns Promise<WatchVideoRecommendationsResponse>
 */
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

/**
 * @description 提取watchaccountvideo
 * @param input - 输入数据
 * @returns Promise<ApiVideoCopyExtraction>
 */
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

/**
 * @description 列出videocopyextractions
 * @returns Promise<
 */
export async function listVideoCopyExtractions(): Promise<{ items: ApiVideoCopyExtraction[] }> {
  return request<{ items: ApiVideoCopyExtraction[] }>("/api/video-copy-extractions")
}

/**
 * @description 创建videocopyextraction
 * @param url - URL 地址
 * @returns Promise<ApiVideoCopyExtraction>
 */
export async function createVideoCopyExtraction(url: string): Promise<ApiVideoCopyExtraction> {
  return request<ApiVideoCopyExtraction>("/api/video-copy-extractions", {
    method: "POST",
    body: JSON.stringify({ url }),
    timeout: 20000,
  })
}

/**
 * @description 获取videocopyextraction
 * @param id - 唯一标识符
 * @returns Promise<ApiVideoCopyExtraction>
 */
export async function getVideoCopyExtraction(id: string): Promise<ApiVideoCopyExtraction> {
  return request<ApiVideoCopyExtraction>(`/api/video-copy-extractions/${id}`)
}

/**
 * @description 同步videocopyextraction
 * @param id - 唯一标识符
 * @returns Promise<ApiVideoCopyExtraction>
 */
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

// ─── 视频号搜索 API ───

export interface SearchChannelsVideoResult {
  videoId: string
  title: string
  coverUrl: string
  /** 可打开的原视频链接；没有可靠来源时为空串 */
  videoUrl?: string
  exportId?: string
  createTime: number
  duration: number
  /** 播放量；上游未提供时为 null */
  views: number | null
  likes: number
  comments: number
  shares: number
  collects: number
  author: { nickname: string; finderUsername: string; avatar: string }
}

export interface SearchChannelsUserResult {
  finderUsername: string
  nickname: string
  avatar: string
  signature: string
  followerCount: number
  videoCount: number
  isVerified: boolean
}

/**
 * @description 搜索视频号视频（选题热度分析）
 * @param keyword - 关键词
 * @param options - 可选参数
 * @returns Promise<{ videos: SearchChannelsVideoResult[]; cursor: string; hasMore: boolean }>
 */
export async function searchChannelsVideos(
  keyword: string,
  options?: { cursor?: string; count?: number; sortType?: 'comprehensive' | 'latest' | 'popular' },
): Promise<{ videos: SearchChannelsVideoResult[]; cursor: string; hasMore: boolean }> {
  return request("/api/competitor/search-channels", {
    method: "POST",
    body: JSON.stringify({ keyword, ...options }),
    timeout: 30000,
  })
}

/**
 * @description 搜索视频号账号
 * @param keyword - 关键词
 * @param cursor - 分页游标
 * @returns Promise<{ users: SearchChannelsUserResult[]; cursor: string; hasMore: boolean }>
 */
export async function searchChannelsUsers(
  keyword: string,
  cursor?: string,
): Promise<{ users: SearchChannelsUserResult[]; cursor: string; hasMore: boolean }> {
  return request("/api/competitor/search-channels-user", {
    method: "POST",
    body: JSON.stringify({ keyword, cursor }),
    timeout: 30000,
  })
}

/**
 * @description 视频号选题热度分析（搜索 + AI 分析）
 * @param keyword - 关键词
 * @param count - 搜索数量
 * @returns Promise<{ keyword: string; videosFound: number; analysis: unknown }>
 */
export async function analyzeChannelsTopic(
  keyword: string,
  count = 20,
): Promise<{ keyword: string; videosFound: number; analysis: unknown; analysisError?: string }> {
  return request("/api/competitor/search-channels/analyze", {
    method: "POST",
    body: JSON.stringify({ keyword, count }),
    timeout: 60000,
  })
}

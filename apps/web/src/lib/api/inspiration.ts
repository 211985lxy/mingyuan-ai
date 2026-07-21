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

export interface ChannelBindingItem {
  id: string
  platform: "feishu" | "workbuddy_wechat" | "wecom"
  externalChatId: string
  projectId: string
  triggerMode: "mention_or_keyword" | "all"
  triggerKeywords: string[]
  executionMode: "capture_only" | "evaluate" | "live"
  /** 路由目标：topic（选题采集）| aim（AIM 智能体对话） */
  routeTarget?: "topic" | "aim"
  /** routeTarget=aim 时的默认智能体；为空则要求消息带 /命令 */
  defaultAgentId?: string | null
  status: "active" | "disabled"
  project: { id: string; name: string; status: string }
  createdAt: string
  updatedAt: string
  // Aggregated health metrics (from GET endpoint)
  lastReceivedAt: string | null
  receivedCount24h: number
  sentCount24h: number
  deadLetterCount24h: number
  healthStatus: "healthy" | "degraded" | "unknown"
}

/**
 * @description 列出channelbindings
 * @returns Promise<ChannelBindingItem[]>
 */
export async function listChannelBindings(): Promise<ChannelBindingItem[]> {
  const response = await request<{ items: ChannelBindingItem[] }>("/api/account/channel-bindings")
  return response.items
}

/**
 * @description savechannelbinding
 * @param input - 输入数据
 * @returns Promise<ChannelBindingItem>
 */
export async function saveChannelBinding(input: {
  platform: ChannelBindingItem["platform"]
  externalChatId: string
  projectId: string
  triggerMode: ChannelBindingItem["triggerMode"]
  triggerKeywords: string[]
  executionMode?: ChannelBindingItem["executionMode"]
  routeTarget?: "topic" | "aim"
  defaultAgentId?: string | null
}): Promise<ChannelBindingItem> {
  return request("/api/account/channel-bindings", { method: "POST", body: JSON.stringify(input) })
}

/**
 * @description 更新channelbinding
 * @param id - 唯一标识符
 * @param input - 输入数据
 * @returns Promise<ChannelBindingItem>
 */
export async function updateChannelBinding(id: string, input: Partial<Pick<ChannelBindingItem, "projectId" | "triggerMode" | "triggerKeywords" | "status" | "routeTarget" | "defaultAgentId">>): Promise<ChannelBindingItem> {
  return request(`/api/account/channel-bindings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) })
}

/**
 * @description 删除channelbinding
 * @param id - 唯一标识符
 * @returns 无返回值
 */
export async function deleteChannelBinding(id: string) {
  return request<{ ok: true }>(`/api/account/channel-bindings/${encodeURIComponent(id)}`, { method: "DELETE" })
}

/**
 * @description testchannelbinding
 * @param id - 唯一标识符
 * @returns 无返回值
 */
export async function testChannelBinding(id: string) {
  return request<{ ok: boolean; checks: Record<string, boolean>; note?: string }>(`/api/account/channel-bindings/${encodeURIComponent(id)}/test`, { method: "POST" })
}

/**
 * @description 列出inspirations
 * @param status? - status?
 * @returns Promise<
 */
export async function listInspirations(status?: string): Promise<{ items: InspirationItem[] }> {
  const params = new URLSearchParams()
  if (status) params.set("status", status)
  return request<{ items: InspirationItem[] }>(`/api/inspiration?${params}`)
}

/**
 * @description 创建inspiration
 * @param data - 数据
 * @returns Promise<InspirationItem>
 */
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

/**
 * @description 处理inspiration
 * @param id - 唯一标识符
 * @returns Promise<
 */
export async function processInspiration(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/inspiration/${id}/process`, {
    method: "POST",
  })
}

/**
 * @description 生成frominspiration
 * @param id - 唯一标识符
 * @param data - 数据
 * @returns Promise<AimGenerateResponse>
 */
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

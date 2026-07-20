"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import type { AimCalibrationRule, AimDecisionSnapshot, AimGeneration, AimRetroSnapshot } from "./aim"
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
 * @description 列出aimhistory
 * @param page - 页码
 * @param pageSize - 页码大小
 * @param projectId? - projectId?
 * @param agentId? - 智能体Id?
 * @returns Promise<AimGeneration[]>
 */
export async function listAimHistory(page = 1, pageSize = 20, projectId?: string, agentId?: string): Promise<AimGeneration[]> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (projectId) params.set("projectId", projectId)
  if (agentId) params.set("agentId", agentId)
  return request<AimGeneration[]>(`/api/aim/history?${params.toString()}`)
}

/**
 * @description 获取aimhistory
 * @param id - 唯一标识符
 * @returns Promise<AimGeneration>
 */
export async function getAimHistory(id: string): Promise<AimGeneration> {
  return request<AimGeneration>(`/api/aim/history/${encodeURIComponent(id)}`)
}

/**
 * @description 列出pendingaimhistory
 * @param pageSize - 页码大小
 * @returns Promise<
 */
export async function listPendingAimHistory(pageSize = 6): Promise<{ items: AimGeneration[]; total: number }> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: String(pageSize),
    scope: "pending",
    includeTotal: "true",
  })
  return request<{ items: AimGeneration[]; total: number }>(`/api/aim/history?${params.toString()}`)
}

export interface ClientProject {
  id: string
  name: string
  companyName: string | null
  industry: string | null
  targetCustomer: string | null
  offer: string | null
  deliveryGoal: string | null
  status: string
  notes: string | null
  createdAt: string
  updatedAt: string
  _count?: { aimGenerations: number }
  aimGenerations?: Array<{
    id: string
    rawInput: string
    workflowStatus: string
    createdAt: string
  }>
}

export interface CreateClientProjectRequest {
  name: string
  companyName?: string
  industry?: string
  targetCustomer?: string
  offer?: string
  deliveryGoal?: string
  notes?: string
}

/**
 * @description 列出clientprojects
 * @param status - 状态
 * @returns Promise<ClientProject[]>
 */
export async function listClientProjects(status = "active"): Promise<ClientProject[]> {
  return request<ClientProject[]>(`/api/projects?status=${encodeURIComponent(status)}`)
}

/**
 * @description 创建clientproject
 * @param data - 数据
 * @returns Promise<ClientProject>
 */
export async function createClientProject(data: CreateClientProjectRequest): Promise<ClientProject> {
  return request<ClientProject>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/**
 * @description 更新clientproject
 * @param id - 唯一标识符
 * @param data - 数据
 * @returns Promise<ClientProject>
 */
export async function updateClientProject(id: string, data: Partial<CreateClientProjectRequest> & { status?: string }): Promise<ClientProject> {
  return request<ClientProject>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

/**
 * @description 更新aimworkflowstatus
 * @param id - 唯一标识符
 * @param data - 数据
 * @returns Promise<AimGeneration>
 */
export async function updateAimWorkflowStatus(id: string, data: {
  workflowStatus?: string
  reviewNote?: string
  publishPlatform?: string
  publishUrl?: string
  decisionSnapshot?: AimDecisionSnapshot
  retroSnapshot?: AimRetroSnapshot
  calibrationRule?: AimCalibrationRule
  projectId?: string
  retroOutcome?: ContentOutcomeInput
}): Promise<AimGeneration> {
  return request<AimGeneration>(`/api/aim/history/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

/**
 * @description 删除aimhistory
 * @param id - 唯一标识符
 * @returns Promise<void>
 */
export async function deleteAimHistory(id: string): Promise<void> {
  await request(`/api/aim/history/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ─── ContentOutcome：结构化发布结果（Sprint 2） ───────────
export interface ContentOutcome {
  id: string
  collectWindowDay: number
  platform?: string | null
  publishedAt?: string | null
  collectedAt: string
  qualifiedCommentCount?: number | null
  dmCount?: number | null
  qualifiedLeadCount?: number | null
  appointmentCount?: number | null
  dealCount?: number | null
  revenue?: number | null
  views?: number | null
  likes?: number | null
  comments?: number | null
  saves?: number | null
  shares?: number | null
  audienceFeedback?: string | null
  userVerdict?: string | null
}

export interface ContentOutcomeInput {
  collectWindowDay: 7 | 14 | 30
  platform?: string
  publishedAt?: string
  qualifiedCommentCount?: number | null
  dmCount?: number | null
  qualifiedLeadCount?: number | null
  appointmentCount?: number | null
  dealCount?: number | null
  revenue?: number | null
  views?: number | null
  likes?: number | null
  comments?: number | null
  saves?: number | null
  shares?: number | null
  audienceFeedback?: string
  userVerdict?: string
}

/**
 * @description 更新或创建contentoutcome
 * @param generationId - 生成唯一标识符
 * @param body - 请求体
 * @returns Promise<
 */
export async function upsertContentOutcome(
  generationId: string,
  body: ContentOutcomeInput,
): Promise<{ outcome: ContentOutcome }> {
  return request(`/api/aim/history/${encodeURIComponent(generationId)}/outcome`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

/**
 * @description 获取contentoutcome
 * @param generationId - 生成唯一标识符
 * @returns Promise<
 */
export async function getContentOutcome(
  generationId: string,
): Promise<{ outcomes: ContentOutcome[]; topicSelectionId?: string | null; projectId?: string | null }> {
  return request(`/api/aim/history/${encodeURIComponent(generationId)}/outcome`, { method: "GET" })
}

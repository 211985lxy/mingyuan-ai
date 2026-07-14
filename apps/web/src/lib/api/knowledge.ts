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

export interface KnowledgeEntry {
  id: string
  userId: string
  projectId?: string | null
  category: string
  title: string
  content: string
  tags: string[]
  sourceType: string
  sortOrder: number
  status: string
  createdAt: string
  updatedAt: string
}

export async function listKnowledge(input?: {
  category?: string
  projectId?: string
  status?: string
}): Promise<KnowledgeEntry[]> {
  const params = new URLSearchParams()
  if (input?.category) params.set("category", input.category)
  if (input?.projectId) params.set("projectId", input.projectId)
  if (input?.status) params.set("status", input.status)
  return request<KnowledgeEntry[]>(`/api/knowledge?${params}`)
}

export async function createKnowledge(data: {
  projectId?: string
  category: string
  title: string
  content: string
  tags?: string[]
  sourceType?: "manual" | "voice_transcribe" | "import"
}): Promise<KnowledgeEntry> {
  return request<KnowledgeEntry>("/api/knowledge", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// ─── IP 定位维基（Karpathy LLM-Wiki 模式） ──────────────

export interface IpWikiCompiledPage {
  pageType: string
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: Array<{ kind: "aim_generation" | "knowledge_entry"; id: string; label?: string }>
  links: string[]
}

export interface IpWikiPageDTO {
  id: string
  projectId: string
  pageType: string
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: IpWikiCompiledPage["sources"]
  links: string[]
  sourceGenerationId: string | null
  version: number
  status: string
  createdAt: string
  updatedAt: string
}

/** Ingest：把定位方案编译成结构化维基页（提议，待人工确认） */
export async function compileIpWikiPositioning(input: {
  projectId: string
  sourceGenerationId?: string
  positioningText?: string
  signal?: AbortSignal
}): Promise<{ pages: IpWikiCompiledPage[]; sourceGenerationId: string | null }> {
  return request("/api/aim/ip-wiki/compile", {
    method: "POST",
    body: JSON.stringify(input),
    signal: input.signal,
    timeout: 60000,
  })
}

/** 列出某 IP 全案的 active 维基页 */
export async function listIpWikiPages(projectId: string): Promise<IpWikiPageDTO[]> {
  const params = new URLSearchParams({ projectId })
  const payload = await request<{ pages: IpWikiPageDTO[] }>(
    `/api/aim/ip-wiki/pages?${params}`
  )
  return payload.pages
}

/** 人工确认后写入维基页 */
export async function saveIpWikiPages(input: {
  projectId: string
  sourceGenerationId?: string
  pages: IpWikiCompiledPage[]
}): Promise<IpWikiPageDTO[]> {
  const payload = await request<{ pages: IpWikiPageDTO[] }>("/api/aim/ip-wiki/pages", {
    method: "POST",
    body: JSON.stringify(input),
    timeout: 30000,
  })
  return payload.pages
}

export interface IpWikiLintFindingDTO {
  severity: "error" | "warning"
  rule: string
  pageType?: string
  pageId?: string
  message: string
}

export interface IpWikiLintReportDTO {
  projectId: string
  totalPages: number
  findings: IpWikiLintFindingDTO[]
  errorCount: number
  warningCount: number
  passed: boolean
}

/** Lint：对某 IP 全案的维基页跑体检（死链/底盘字段缺失/来源过时/比例失衡） */
export async function lintIpWikiPages(projectId: string): Promise<IpWikiLintReportDTO> {
  const params = new URLSearchParams({ projectId })
  const payload = await request<{ report: IpWikiLintReportDTO }>(
    `/api/aim/ip-wiki/lint?${params}`
  )
  return payload.report
}

export async function updateKnowledge(
  id: string,
  data: Partial<{
    title: string
    content: string
    category: string
    tags: string[]
  }>
): Promise<KnowledgeEntry> {
  return request<KnowledgeEntry>(`/api/knowledge/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteKnowledge(id: string): Promise<void> {
  await request(`/api/knowledge/${id}`, { method: "DELETE" })
}

// ─── AIM 生成 ────────────────────────────────────────────

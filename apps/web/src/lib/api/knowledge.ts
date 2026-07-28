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
import type { KnowledgeAssetHealthResult } from "@/lib/knowledge-asset-health"

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

/**
 * @description 列出knowledge
 * @param input? - input?
 * @returns Promise<KnowledgeEntry[]>
 */
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

/**
 * @description 读取单条知识条目（原文预览）
 */
export async function getKnowledge(id: string): Promise<KnowledgeEntry> {
  return request<KnowledgeEntry>(`/api/knowledge/${encodeURIComponent(id)}`)
}

/**
 * @description 创建knowledge
 * @param data - 数据
 * @returns Promise<KnowledgeEntry>
 */
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

export interface KnowledgeAssetHealthApiPayload {
  health: KnowledgeAssetHealthResult
  scannedCount: number
  truncated: boolean
}

/**
 * @description 读取当前用户项目知识资产健康度（服务端确定性聚合）
 */
export async function fetchKnowledgeAssetHealth(
  projectId: string,
): Promise<KnowledgeAssetHealthApiPayload> {
  const params = new URLSearchParams({ projectId })
  const res = await request<{ data: KnowledgeAssetHealthApiPayload }>(
    `/api/knowledge/asset-health?${params}`,
  )
  return res.data
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
/**
 * @description 编译ipwikipositioning
 * @param input - 输入数据
 * @returns Promise<
 */
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
/**
 * @description 列出ipwikipages
 * @param projectId - 项目 ID
 * @returns Promise<IpWikiPageDTO[]>
 */
export async function listIpWikiPages(projectId: string): Promise<IpWikiPageDTO[]> {
  const params = new URLSearchParams({ projectId })
  const payload = await request<{ pages: IpWikiPageDTO[] }>(
    `/api/aim/ip-wiki/pages?${params}`
  )
  return payload.pages
}

/** 人工确认后写入维基页 */
/**
 * @description saveipwikipages
 * @param input - 输入数据
 * @returns Promise<IpWikiPageDTO[]>
 */
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

/** 客户自助编辑单页：只改 title/content/frontmatter/links，旧 active 归档、version+1 */
/**
 * @description 更新ipwikipage
 * @param id - 维基页 id
 * @param data - 可编辑字段补丁
 * @returns Promise<IpWikiPageDTO>
 */
export async function updateIpWikiPage(
  id: string,
  data: {
    projectId: string
    title?: string
    content?: string
    frontmatter?: Record<string, unknown>
    links?: string[]
  },
): Promise<IpWikiPageDTO> {
  const payload = await request<{ page: IpWikiPageDTO }>(`/api/aim/ip-wiki/pages/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
    timeout: 30000,
  })
  return payload.page
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
/**
 * @description lintipwikipages
 * @param projectId - 项目 ID
 * @returns Promise<IpWikiLintReportDTO>
 */
export async function lintIpWikiPages(projectId: string): Promise<IpWikiLintReportDTO> {
  const params = new URLSearchParams({ projectId })
  const payload = await request<{ report: IpWikiLintReportDTO }>(
    `/api/aim/ip-wiki/lint?${params}`
  )
  return payload.report
}

/**
 * @description 更新knowledge
 * @param id - 唯一标识符
 * @param data - 数据
 * @returns Promise<KnowledgeEntry>
 */
export async function updateKnowledge(
  id: string,
  data: Partial<{
    title: string
    content: string
    category: string
    tags: string[]
    projectId: string | null
  }>
): Promise<KnowledgeEntry> {
  return request<KnowledgeEntry>(`/api/knowledge/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

/**
 * @description 归档 knowledge（后端 DELETE 实为 status=archived，非物理删除）
 */
export async function archiveKnowledge(id: string): Promise<void> {
  await request(`/api/knowledge/${id}`, { method: "DELETE" })
}

/** @deprecated 使用 archiveKnowledge；语义上是归档不是硬删 */
export async function deleteKnowledge(id: string): Promise<void> {
  await archiveKnowledge(id)
}

// ─── AIM 生成 ────────────────────────────────────────────

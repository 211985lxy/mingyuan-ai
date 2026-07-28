"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import type { KnowledgeEntry } from "./knowledge"
import type { HotTopic } from "@/types/content-template"
import type { StyleGuideId } from "@/lib/style-guide-config"
import type {
  AimGenerateBody,
  AimWorkflowBriefBody,
} from "@/features/aim/contracts/api"
import { serializeAimGenerateRequestBody } from "@/lib/aim/generate-payload-budget"
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

export type ContentFormat = NonNullable<AimGenerateBody["targetFormats"]>[number]

export type AimTaskType =
  | "polish_copy"
  | "write_script"
  | "quality_check"
  | "repurpose"

export type AimGenerateRequest = AimGenerateBody

export interface AimWorkflowBriefResponse {
  stage: import("@/lib/aim-workflow").AimWorkflowStage
  projectId?: string
  sourceGenerationId?: string
  taskSpec: import("@/lib/task-spec").TaskSpec
}

export interface AimGenerateResult {
  format: ContentFormat
  content: string
  wordCount: number
}

export interface AimGenerateResponse {
  id: string
  results: AimGenerateResult[]
  knowledgeUsed: Array<{
    id: string
    title: string
    category: string
    categoryLabel?: string
    snippet?: string
  }>
  conversationMode?: string
  /** 本次实际生效的知识调用策略（由服务端解析，供 UI 反馈） */
  knowledgeStrategy?: string
  // ── aim-harness-v1 additive diagnostics (optional; always present from the
  // generate/inspiration entrypoints). Existing consumers ignore these. ──
  /** 对外执行编号（仅在结果详情/低分/降级时向用户展示） */
  runId?: string
  /** 是否发生了 provider fallback 后继续交付 */
  degraded?: boolean
  /** 实际命中的 provider / 模型（降级或排查时展示） */
  provider?: string
  model?: string
  /** 主稿确定性+LLM 质量结果：pass | warn | fail | skipped */
  qualityStatus?: "pass" | "warn" | "fail" | "skipped"
  /** 每种格式的确定性检查（空内容/长度/禁词/AI 味） */
  qualityChecks?: Array<{
    format: ContentFormat
    passed: boolean
    checks: Array<{ name: string; passed: boolean; detail?: string }>
  }>
  /** 协作认知层产物：风险/模式/事实/缺口/假设 */
  taskSpec?: import("@/lib/task-spec").TaskSpec
  /** 工作流状态（历史回填或状态推进后可选出现） */
  workflowStatus?: string
  projectId?: string | null
  reviewNote?: string | null
  publishPlatform?: string | null
  publishUrl?: string | null
}

export interface AimDecisionSnapshot {
  summary: string
  targetUser?: string
  expectedSignal?: string
  confidence?: string
  createdAt?: string
}

export interface AimRetroSnapshot {
  summary: string
  actualData?: string
  verdict?: string
  nextRule?: string
  createdAt?: string
}

export interface AimCalibrationRule {
  rule: string
  source?: string
  createdAt?: string
}

export interface AimGeneration {
  id: string
  agentId?: string | null
  projectId?: string | null
  rawInput: string
  videoScript: string | null
  wechatArticle: string | null
  momentsPost: string | null
  communityMessage: string | null
  shootingBrief: string | null
  rawCopy: string | null
  formatsRequested: string[]
  knowledgeUsed: Array<{
    id: string
    title: string
    category: string
    categoryLabel?: string
    snippet?: string
  }>
  createdAt: string
  updatedAt?: string
  hotTopic?: string | null
  polishInstruction?: string | null
  qualityScores?: unknown
  topicTitle?: string | null
  topicSelectionId?: string | null
  selectedTopicIndex?: number | null
  workflowStatus?: string
  reviewNote?: string | null
  publishedAt?: string | null
  publishPlatform?: string | null
  publishUrl?: string | null
  decisionSnapshot?: AimDecisionSnapshot | null
  retroSnapshots?: AimRetroSnapshot[]
  calibrationRules?: AimCalibrationRule[]
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
}

/**
 * @description 生成aimcontent
 * @param data - 数据
 * @param signal? - signal?
 * @returns Promise<AimGenerateResponse>
 */
export async function generateAimContent(data: AimGenerateRequest, signal?: AbortSignal): Promise<AimGenerateResponse> {
  return request<AimGenerateResponse>("/api/aim/generate", {
    method: "POST",
    body: serializeAimGenerateRequestBody(data),
    timeout: 180000,
    signal,
  })
}

/**
 * @description 确认或修订母内容（写入 generation.taskSpec.canonical）
 */
export async function confirmAimCanonicalContent(input: {
  generationId: string
  action: "confirm" | "revise"
  canonical?: Partial<import("@/lib/canonical-content-spec").CanonicalContentSpec>
}): Promise<{
  id: string
  canonical: import("@/lib/canonical-content-spec").CanonicalContentSpec
  taskSpec: import("@/lib/task-spec").TaskSpec
}> {
  const res = await request<{
    data: {
      id: string
      canonical: import("@/lib/canonical-content-spec").CanonicalContentSpec
      taskSpec: import("@/lib/task-spec").TaskSpec
    }
  }>(`/api/aim/history/${encodeURIComponent(input.generationId)}/canonical`, {
    method: "POST",
    body: JSON.stringify({
      action: input.action,
      ...(input.canonical ? { canonical: input.canonical } : {}),
    }),
  })
  return res.data
}

/**
 * @description 创建aimworkflowbrief
 * @param data - 数据
 * @returns Promise<AimWorkflowBriefResponse>
 */
export async function createAimWorkflowBrief(
  data: AimWorkflowBriefBody,
): Promise<AimWorkflowBriefResponse> {
  return request<AimWorkflowBriefResponse>("/api/aim/workflow/brief", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/**
 * 规则 +（低置信）向量兜底解析本轮意图，供生成前确认。
 */
export async function resolveAimTurnIntentRemote(data: {
  rawInput: string
  targetFormats?: ContentFormat[]
  projectId?: string
  archive?: {
    hasProject?: boolean
    knowledgeCount?: number
    knownFactCount?: number
    hasOfferSignal?: boolean
    hasCaseSignal?: boolean
    unknowns?: string[]
  }
}): Promise<import("@/lib/aim-intent-vector").ResolveTurnIntentResult> {
  return request("/api/aim/intent-resolve", {
    method: "POST",
    body: JSON.stringify(data),
    timeout: 45_000,
  })
}

/**
 * 计划模式：请求档案驱动追问
 * @param data - 计划请求体
 * @param signal - 可选 AbortSignal
 * @returns 计划响应（问题、假设、任务单快照）
 */
export async function requestAimPlan(
  data: import("@/lib/aim/plan-types").PlanRequest,
  signal?: AbortSignal,
): Promise<import("@/lib/aim/plan-types").PlanResponse> {
  return request<import("@/lib/aim/plan-types").PlanResponse>("/api/aim/workflow/plan", {
    method: "POST",
    body: JSON.stringify(data),
    signal,
  })
}

/**
 * @description recordaimrunevent
 * @param runId - run唯一标识符
 * @param event - 事件对象
 * @param metadata? - metadata?
 * @returns Promise<void>
 */
export async function recordAimRunEvent(
  runId: string,
  event: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await request(`/api/aim/runs/${encodeURIComponent(runId)}/events`, {
    method: "POST",
    body: JSON.stringify({ event, metadata }),
  })
}

export interface AimEvolutionSuggestion {
  category: "user_insight"
  title: string
  content: string
  tags: string[]
}

/**
 * @description evolveaimconversation
 * @param input - 输入数据
 * @returns Promise<AimEvolutionSuggestion[]>
 */
export async function evolveAimConversation(input: {
  projectId: string
  messages: Array<{ role: "user" | "assistant"; content: string }>
  signal?: AbortSignal
}): Promise<AimEvolutionSuggestion[]> {
  const payload = await request<{ suggestions: AimEvolutionSuggestion[] }>("/api/aim/evolve", {
    method: "POST",
    body: JSON.stringify({
      projectId: input.projectId,
      messages: input.messages,
    }),
    signal: input.signal,
    timeout: 30000,
  })
  return payload.suggestions
}

export interface StyleProfileEvolveResult {
  delta: (Partial<import("@/lib/aim-style-evolution").StyleProfileDelta> & {
    evidence?: string
    confidence?: string
  }) | null
  profile: { id: string; title: string } | null
  created?: boolean
  reason?: string
  preview?: boolean
}

/** 渐进沉淀：从当前对话提炼并更新写作风格档案（旧路径，兼容） */
export async function evolveStyleConversation(input: {
  messages: Array<{ role: "user" | "assistant"; content: string }>
  projectId?: string
  signal?: AbortSignal
}): Promise<StyleProfileEvolveResult> {
  return request<StyleProfileEvolveResult>("/api/aim/evolve-style", {
    method: "POST",
    body: JSON.stringify({ messages: input.messages, projectId: input.projectId }),
    signal: input.signal,
    timeout: 60000,
  })
}

/** 风格预览：只分析不写库 */
export async function previewStyleProfile(input: {
  samples?: Array<{ content: string; label?: "core" | "normal" }>
  messages?: Array<{ role: "user" | "assistant"; content: string }>
  projectId?: string
  signal?: AbortSignal
}): Promise<StyleProfileEvolveResult> {
  return request<StyleProfileEvolveResult>("/api/aim/evolve-style", {
    method: "POST",
    body: JSON.stringify({
      operation: "preview",
      samples: input.samples,
      messages: input.messages,
      projectId: input.projectId,
    }),
    signal: input.signal,
    timeout: 60000,
  })
}

/** 风格确认写入：合并已确认候选到主档案 */
export async function commitStyleProfile(input: {
  delta: import("@/lib/aim-style-evolution").StyleProfileDelta
  projectId?: string
  signal?: AbortSignal
}): Promise<StyleProfileEvolveResult> {
  return request<StyleProfileEvolveResult>("/api/aim/evolve-style", {
    method: "POST",
    body: JSON.stringify({
      operation: "commit",
      delta: input.delta,
      projectId: input.projectId,
    }),
    signal: input.signal,
    timeout: 60000,
  })
}

/** 创作台风格状态：项目优先，无则全局 */
export async function fetchStyleStatus(input?: {
  projectId?: string
  signal?: AbortSignal
}): Promise<{ enabled: boolean; scope: "project" | "global" | "none" }> {
  const qs = input?.projectId ? `?projectId=${encodeURIComponent(input.projectId)}` : ""
  return request(`/api/aim/style-status${qs}`, {
    method: "GET",
    signal: input?.signal,
  })
}

/**
 * @description 生成script
 * @param data - 数据
 * @returns Promise<AimGenerateResponse>
 */
export function generateScript(data: {
  projectId: string
  topicTitle?: string
  sourceText: string
  knowledgeEntryIds?: string[]
}): Promise<AimGenerateResponse> {
  return generateAimContent({
    projectId: data.projectId,
    rawInput: data.sourceText,
    topicTitle: data.topicTitle,
    targetFormats: ["video_script", "shooting_brief"],
    taskType: "write_script",
  })
}

/**
 * @description 生成positioning
 * @param data - 数据
 * @returns Promise<AimGenerateResponse>
 */
export function generatePositioning(data: {
  projectId: string
  sourceText: string
  knowledgeEntryIds?: string[]
}): Promise<AimGenerateResponse> {
  return generateAimContent({
    projectId: data.projectId,
    rawInput: data.sourceText,
    targetFormats: ["raw_copy"],
    taskType: "polish_copy",
    polishInstruction: "输出商业策划定位判断，包含 IP 定位、内容定位、目标客群、成交路径和下一步内容建议。",
  })
}

/**
 * @description 生成momentscopy
 * @param data - 数据
 * @returns Promise<AimGenerateResponse>
 */
export function generateMomentsCopy(data: {
  projectId: string
  sourceText: string
  intent?: string
  knowledgeEntryIds?: string[]
}): Promise<AimGenerateResponse> {
  return generateAimContent({
    projectId: data.projectId,
    rawInput: data.intent ? `${data.intent}\n\n${data.sourceText}` : data.sourceText,
    targetFormats: ["moments_post", "community_message"],
    taskType: "write_script",
  })
}

/**
 * @description 导入fromlarkbase
 * @param data - 数据
 * @returns Promise<
 */
export function importFromLarkBase(data: {
  projectId: string
  tableType: "topic_review" | "project_management" | "data_archive"
}): Promise<{ created: number; updated: number; entries: KnowledgeEntry[] }> {
  return request<{ created: number; updated: number; entries: KnowledgeEntry[] }>("/api/lark-base/import", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/**
 * @description 导出tolarkbase
 * @param data - 数据
 * @returns Promise<
 */
export function exportToLarkBase(data: {
  projectId: string
  resultType: "topic" | "script" | "positioning" | "moments_copy"
  resultId: string
}): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/lark-base/export", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/** ADR-002：命名方法论列表项（前端选择器用）。 */
export interface MethodologyProfileSummary {
  id: string
  name: string
  originatorName: string | null
  description: string | null
  scope: string
  latestVersion: number | null
  updatedAt: string
}

/**
 * 拉取当前用户可见的命名方法论列表（供「参考方法论」选择器）。
 * 功能开关关闭时后端返回空数组，前端据此隐藏选择器。
 *
 * @description 拉取methodologyprofiles
 * @returns Promise<MethodologyProfileSummary[]>
 */
export function fetchMethodologyProfiles(): Promise<MethodologyProfileSummary[]> {
  return request<MethodologyProfileSummary[]>("/api/methodology-profiles")
}


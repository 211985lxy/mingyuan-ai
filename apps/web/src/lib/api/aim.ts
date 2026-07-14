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
  knowledgeUsed: { id: string; title: string; category: string }[]
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
  knowledgeUsed: { id: string; title: string; category: string }[]
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

export async function generateAimContent(data: AimGenerateRequest, signal?: AbortSignal): Promise<AimGenerateResponse> {
  return request<AimGenerateResponse>("/api/aim/generate", {
    method: "POST",
    body: JSON.stringify(data),
    timeout: 180000,
    signal,
  })
}

export async function createAimWorkflowBrief(
  data: AimWorkflowBriefBody,
): Promise<AimWorkflowBriefResponse> {
  return request<AimWorkflowBriefResponse>("/api/aim/workflow/brief", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function recordAimRunEvent(
  runId: string,
  event: "copied" | "revised" | "accepted",
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
  delta: { evidence: string; confidence: string } | null
  profile: { id: string; title: string } | null
  created?: boolean
  reason?: string
}

/** 渐进沉淀：从当前对话提炼并更新写作风格档案 */
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

export function importFromLarkBase(data: {
  projectId: string
  tableType: "topic_review" | "project_management" | "data_archive"
}): Promise<{ created: number; updated: number; entries: KnowledgeEntry[] }> {
  return request<{ created: number; updated: number; entries: KnowledgeEntry[] }>("/api/lark-base/import", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

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

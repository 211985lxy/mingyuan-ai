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

export async function listTemplates(): Promise<PaginatedResponse<PublicTemplateListItem>> {
  const payload = await request<{ data: PaginatedResponse<PublicTemplateListItem> }>("/api/templates")
  return payload.data
}

export async function listStructures(): Promise<ApiVideoStructure[]> {
  const payload = await request<{ data: ApiVideoStructure[] }>("/api/structures")
  return payload.data
}

export async function getTemplate(id: string): Promise<PublicTemplateDetail> {
  const payload = await request<{ data: PublicTemplateDetail }>(`/api/templates/${id}`)
  return payload.data
}

export async function aiFillBrief(input: {
  templateId: string
  userInput?: string
}): Promise<{ filledInputs: Record<string, string> }> {
  const payload = await request<{ data: { filledInputs: Record<string, string> } }>(
    "/api/brief/ai-fill",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
  return payload.data
}

export async function generateScripts(input: {
  templateId: string
  inputs: Record<string, string>
  structureId: string
  hotTopicId?: string | null
  hotTopic?: string | null
  topicSelectionId?: string | null
  openingTypeCode?: string | null
  copyStructureCode?: string | null
  endingTypeCode?: string | null
}): Promise<{ run: ApiContentGenerationRun; scripts: ApiScript[]; isDegraded?: boolean }> {
  const payload = await request<{ data: { run: ApiContentGenerationRun; scripts: ApiScript[]; isDegraded?: boolean } }>(
    "/api/scripts/generate",
    {
      method: "POST",
      body: JSON.stringify(input),
      timeout: 120000, // 120 second timeout for LLM operations (matches server maxDuration)
    }
  )
  return payload.data
}

export async function updateScript(
  id: string,
  input: { content?: string; status?: string }
): Promise<ApiScript> {
  const payload = await request<{ data: ApiScript }>(`/api/scripts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
  return payload.data
}

export interface QualityDimensionScore {
  score: number       // 0-100（从后端 1-10 转换）
  passed: boolean
  feedback: string
  details?: string
}

export interface PublishCheckViolation {
  text: string
  severity: "high" | "mid" | "low"
  category: string
  reason: string
  suggest: string
}

export interface PublishCheckReport {
  verdict: "可发" | "改完可发" | "高风险勿发"
  violations: PublishCheckViolation[]
  aiLabelReminder: string
  trafficScore: {
    score: number
    level: "高" | "中" | "低"
    reasons: string[]
  }
  trafficWeakness: string[]
  minimalRewrite: string
}

export interface QualityCheckReport {
  editorial: QualityDimensionScore
  aiTaste: QualityDimensionScore
  attraction: QualityDimensionScore
  logic: QualityDimensionScore
  overall: { score: number; passed: boolean; needsRewrite: boolean }
  rewriteCount: number
  publishCheck?: PublishCheckReport
}

/** 将后端 1-10 分转换为 0-100 分 */
function toPercent(score1to10: number): number {
  return Math.round(score1to10 * 10)
}

export async function checkScriptQuality(input: {
  content: string
  topicTitle?: string
  publishPlatform?: "douyin"
  persona?: string | {
    roleType?: string
    oneLiner?: string
    toneOfVoice?: string
  }
}): Promise<QualityCheckReport> {
  const payload = await request<{
    data: {
      content: string
      report: {
        editorial: { score: number; passed: boolean; feedback: string; details?: string }
        aiTaste: { score: number; passed: boolean; feedback: string; details?: string }
        attraction: { score: number; passed: boolean; feedback: string; details?: string }
        logic: { score: number; passed: boolean; feedback: string; details?: string }
        overall: { score: number; passed: boolean; needsRewrite: boolean }
        rewriteCount: number
      }
      publishCheck?: PublishCheckReport
    }
  }>("/api/scripts/quality-check", {
    method: "POST",
    body: JSON.stringify(input),
    timeout: 30000, // 30 second timeout for quality check
  })
  const d = payload.data.report
  return {
    editorial: { ...d.editorial, score: toPercent(d.editorial.score) },
    aiTaste: { ...d.aiTaste, score: toPercent(d.aiTaste.score) },
    attraction: { ...d.attraction, score: toPercent(d.attraction.score) },
    logic: { ...d.logic, score: toPercent(d.logic.score) },
    overall: { ...d.overall, score: toPercent(d.overall.score) },
    rewriteCount: d.rewriteCount,
    publishCheck: payload.data.publishCheck,
  }
}

export interface PolishResult {
  original: string
  polished: string
  polishedDimensions: string[]
}

export async function polishScript(input: {
  content: string
  weakDimensions?: string[]
  topicTitle?: string
  persona?: string
  mode?: "polish" | "proofread" | "imitate"
  /** imitate 模式必填：对标爆款原文 */
  viralSourceText?: string
  /** imitate 模式可选：12 风格之一，覆盖用户档案做本次腔调；不传则走用户写作风格档案 */
  styleId?: StyleGuideId
  /** imitate 模式可选：项目 id，用于注入项目知识库填充新内容 */
  projectId?: string
}): Promise<PolishResult> {
  const payload = await request<{ data: PolishResult }>("/api/scripts/polish", {
    method: "POST",
    body: JSON.stringify(input),
    timeout: 60000,
  })
  return payload.data
}

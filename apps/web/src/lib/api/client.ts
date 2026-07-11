"use client"

import { useAuthStore } from "@/lib/store"
import { getStoredAuthToken } from "@/lib/auth-storage"
import type { HotTopic } from "@/types/content-template"
import type { StyleGuideId } from "@/lib/style-guide-config"
import type {
  ApiAsset,
  ApiAvatar,
  ApiContentGenerationRun,
  ApiHotTopicFit,
  ApiHotTopicInsight,
  ApiTopicRecommendationMode,
  ApiPublicAssetVoice,
  ApiPublicVirtualman,
  ApiPublicAvatarPreviewDefaults,
  ApiPublicAvatarPreview,
  ApiScript,
  ApiUser,
  ApiVideoTask,
  ApiVideoPackagingTemplate,
  ApiVideoProductionPlan,
  ApiVideoStructure,
  AuthResponse,
  ApiPackagingRecommendationContext,
  BackgroundMusicSelection,
  MaterialAssignment,
  HotTopicsResponse,
  PaginatedResponse,
  PackagingMaterialSuggestionsResponse,
  PublicTemplateDetail,
  PublicTemplateListItem,
  ApiTopicGenerateResponse,
  ApiTopicSelectResponse,
  ApiOpeningType,
  ApiCopyStructure,
  ApiEndingType,
  ApiCompetitorAnalysis,
  CompetitorReportsResponse,
  ApiCompetitorWebResearch,
  ApiAccountHotSources,
  ApiAiHotBriefing,
  ApiHotDecisionResponse,
  ApiHotDecisionSource,
  ApiMarketHotSnapshot,
  ApiVideoCopyExtraction,
  ApiAgentApiKeySummary,
  ApiTopicCard,
} from "@/types/api"

class ApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

export function getApiErrorMessage(payload: unknown, status: number, statusText: string): string {
  if (typeof (payload as { error?: unknown } | null)?.error === "string") {
    const error = (payload as { error: string }).error
    if (/<html[\s>]/i.test(error) || /504 Gateway Time-?out/i.test(error)) {
      return "AI 服务响应超时，请稍后重试"
    }
    return error
  }
  return statusText ? `${status} ${statusText}` : `Request failed: ${status}`
}

type RequestOptions = RequestInit & {
  auth?: boolean
  timeout?: number // timeout in milliseconds
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, timeout, signal, ...init } = options
  const token = auth
    ? useAuthStore.getState().token || getStoredAuthToken()
    : null

  // Add timeout support using AbortController
  const controller = new AbortController()
  let abortedBySignal = false
  const abortFromSignal = () => {
    abortedBySignal = true
    controller.abort()
  }
  if (signal?.aborted) abortFromSignal()
  else if (signal) signal.addEventListener("abort", abortFromSignal, { once: true })
  const timeoutId = timeout
    ? setTimeout(() => controller.abort(), timeout)
    : null

  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers ?? {}),
      },
    })

    if (timeoutId) clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", abortFromSignal)

    const text = await response.text().catch(() => "")
    const payload = text
      ? (() => {
          try {
            return JSON.parse(text) as unknown
          } catch {
            return { error: text }
          }
        })()
      : null

    if (!response.ok) {
      if (response.status === 401) {
        useAuthStore.getState().clearSession()
      }

      throw new ApiError(
        getApiErrorMessage(payload, response.status, response.statusText),
        response.status,
        payload
      )
    }

    return payload as T
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", abortFromSignal)

    if (error instanceof Error && error.name === "AbortError") {
      if (abortedBySignal) {
        throw new ApiError("请求已停止", 499, { code: "ABORTED", originalPath: path })
      }
      throw new ApiError(
        "请求超时，请检查网络连接或稍后重试",
        408,
        { code: "TIMEOUT", originalPath: path }
      )
    }
    throw error
  }
}

export { ApiError }

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


export async function listHotTopics(input?: { source?: string }): Promise<HotTopicsResponse> {
  const url = input?.source ? `/api/hot-topics?source=${encodeURIComponent(input.source)}` : "/api/hot-topics"
  const payload = await request<{ data: HotTopicsResponse }>(url, {
    auth: false,
  })
  return payload.data
}

export async function getTodayAiHotBriefing(input?: { accountEmail?: string }): Promise<ApiAiHotBriefing> {
  const query = input?.accountEmail ? `?accountEmail=${encodeURIComponent(input.accountEmail)}` : ""
  const payload = await request<{ data: ApiAiHotBriefing }>(`/api/aihot-briefing/today${query}`)
  return payload.data
}

export async function refreshTodayAiHotBriefing(): Promise<ApiAiHotBriefing> {
  const payload = await request<{ data: ApiAiHotBriefing }>("/api/aihot-briefing/today/refresh", {
    method: "POST",
  })
  return payload.data
}

export async function getMarketHotSnapshot(): Promise<ApiMarketHotSnapshot> {
  const payload = await request<{ data: ApiMarketHotSnapshot }>("/api/market-insights/last30days/hotlist")
  return payload.data
}

export async function refreshMarketHotSnapshot(): Promise<ApiMarketHotSnapshot> {
  const payload = await request<{ data: ApiMarketHotSnapshot }>("/api/market-insights/last30days/hotlist/refresh", {
    method: "POST",
  })
  return payload.data
}

export async function getHotDecisions(source: ApiHotDecisionSource): Promise<ApiHotDecisionResponse> {
  const payload = await request<{ data: ApiHotDecisionResponse }>(`/api/hot-decisions?source=${encodeURIComponent(source)}`, {
    auth: false,
  })
  return payload.data
}

export async function refreshHotDecisions(source: ApiHotDecisionSource): Promise<ApiHotDecisionResponse> {
  const payload = await request<{ data: ApiHotDecisionResponse }>(`/api/hot-decisions/refresh?source=${encodeURIComponent(source)}`, {
    method: "POST",
  })
  return payload.data
}


export async function getHotTopicInsight(input: {
  topicId: string
}): Promise<{ topic: HotTopic; insight: ApiHotTopicInsight }> {
  const payload = await request<{
    data: { topic: HotTopic; insight: ApiHotTopicInsight }
  }>(`/api/hot-topics/${encodeURIComponent(input.topicId)}/insight`)
  return payload.data
}

export async function getHotTopicFit(input: {
  topicId: string
  templateId: string
  structureId: string
  inputs: Record<string, string>
}): Promise<{
  topic: HotTopic
  insight: ApiHotTopicInsight
  fit: ApiHotTopicFit
}> {
  const payload = await request<{
    data: {
      topic: HotTopic
      insight: ApiHotTopicInsight
      fit: ApiHotTopicFit
    }
  }>(`/api/hot-topics/${encodeURIComponent(input.topicId)}/fit`, {
    method: "POST",
    body: JSON.stringify({
      templateId: input.templateId,
      structureId: input.structureId,
      inputs: input.inputs,
    }),
  })
  return payload.data
}

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

export async function getPublicAssets(): Promise<{
  voices: ApiPublicAssetVoice[]
  virtualmen: ApiPublicVirtualman[]
}> {
  const payload = await request<{
    data: {
      voices: ApiPublicAssetVoice[]
      virtualmen: ApiPublicVirtualman[]
    }
  }>("/api/public-assets", {
    auth: false,
  })
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

export async function listAvatars(): Promise<ApiAvatar[]> {
  const payload = await request<{ data: PaginatedResponse<ApiAvatar> }>("/api/avatars?page=1&pageSize=100")
  return payload.data.results
}

export async function createAvatar(input: Record<string, unknown>): Promise<ApiAvatar> {
  const payload = await request<{ data: ApiAvatar }>("/api/avatars", {
    method: "POST",
    body: JSON.stringify(input),
    timeout: 15000, // 15 second timeout for avatar creation submission
  })
  return payload.data
}

export async function retryAvatar(id: string): Promise<ApiAvatar> {
  const payload = await request<{ data: ApiAvatar }>(`/api/avatars/${id}/retry`, {
    method: "POST",
    timeout: 15000,
  })
  return payload.data
}

export async function deleteAvatar(id: string): Promise<void> {
  await request(`/api/avatars/${id}`, {
    method: "DELETE",
  })
}

export async function listAssets(
  assetType?: "image" | "video" | "music"
): Promise<ApiAsset[]> {
  const search = new URLSearchParams({
    page: "1",
    pageSize: "100",
  })
  if (assetType) {
    search.set("assetType", assetType)
  }

  const payload = await request<{ data: PaginatedResponse<ApiAsset> }>(`/api/assets?${search.toString()}`)
  return payload.data.results
}

export async function createAssetUploadUrl(fileName: string, contentType: string) {
  const payload = await request<{ data: { uploadUrl: string; assetUrl: string; readUrl?: string; expiresAt: string } }>(
    "/api/assets/upload-url",
    {
      method: "POST",
      body: JSON.stringify({ fileName, contentType }),
    }
  )

  return payload.data
}

export async function uploadFileToStorage(file: File) {
  const signed = await createAssetUploadUrl(file.name, file.type || "application/octet-stream")
  const upload = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  })

  if (!upload.ok) {
    throw new ApiError("Failed to upload file", upload.status, null)
  }

  return signed.assetUrl
}

export async function uploadImageForAimChat(file: File) {
  const signed = await createAssetUploadUrl(file.name, file.type || "application/octet-stream")
  const upload = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  })

  if (!upload.ok) {
    throw new ApiError("Failed to upload image", upload.status, null)
  }

  return {
    assetUrl: signed.assetUrl,
    readUrl: signed.readUrl || signed.assetUrl,
  }
}

export async function registerAsset(input: {
  name: string
  assetType: string
  url: string
  size?: number | null
}): Promise<ApiAsset> {
  const payload = await request<{ data: ApiAsset }>("/api/assets", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function deleteAsset(id: string): Promise<void> {
  await request(`/api/assets/${id}`, {
    method: "DELETE",
  })
}

export async function listVideoTasks(): Promise<ApiVideoTask[]> {
  const payload = await request<{ data: PaginatedResponse<ApiVideoTask> }>("/api/tasks?page=1&pageSize=100")
  return payload.data.results
}

export async function getVideoTask(id: string): Promise<ApiVideoTask> {
  const payload = await request<{ data: ApiVideoTask }>(`/api/tasks/${id}`)
  return payload.data
}

export async function createVideoTask(input: Record<string, unknown>): Promise<ApiVideoTask> {
  const payload = await request<{ data: ApiVideoTask }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function getVideoTaskRetryPayload(id: string): Promise<{ retryPayload: Record<string, unknown>; originalTaskId: string }> {
  const payload = await request<{ data: { retryPayload: Record<string, unknown>; originalTaskId: string } }>(`/api/tasks/${id}/retry`, {
    method: "POST",
  })
  return payload.data
}

export async function createPublicAvatarPreview(input: {
  virtualmanId: string
  speakerId: string
  text: string
}): Promise<ApiPublicAvatarPreview> {
  const payload = await request<{ data: ApiPublicAvatarPreview }>(
    "/api/public-avatar-previews",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
  return payload.data
}

export async function getPublicAvatarPreview(taskId: string): Promise<ApiPublicAvatarPreview> {
  const payload = await request<{ data: ApiPublicAvatarPreview }>(
    `/api/public-avatar-previews/${taskId}`
  )
  return payload.data
}

export async function getPublicAvatarPreviewDefaults(
  virtualmanId: string
): Promise<ApiPublicAvatarPreviewDefaults> {
  const payload = await request<{ data: ApiPublicAvatarPreviewDefaults }>(
    `/api/public-avatar-previews?virtualmanId=${encodeURIComponent(virtualmanId)}`
  )
  return payload.data
}

export async function listPackagingTemplates(input?: {
  scene?: string
  structureId?: string | null
  scriptId?: string | null
}): Promise<ApiVideoPackagingTemplate[]> {
  const search = new URLSearchParams()
  if (input?.scene) {
    search.set("scene", input.scene)
  }
  if (input?.structureId) {
    search.set("structureId", input.structureId)
  }
  if (input?.scriptId) {
    search.set("scriptId", input.scriptId)
  }
  const url = search.size > 0 ? `/api/packaging-templates?${search.toString()}` : "/api/packaging-templates"
  const payload = await request<{ data: ApiVideoPackagingTemplate[] }>(url)
  return payload.data
}

export async function syncPackagingTemplates(): Promise<{ synced: number }> {
  const payload = await request<{ data: { synced: number } }>("/api/packaging-templates/sync", {
    method: "POST",
  })
  return payload.data
}

export async function createProductionPlan(input: {
  scriptId: string
  contentTemplateId?: string
  packagingTemplateId?: string
  structureId?: string
  styleId?: string
  materials?: MaterialAssignment[]
  backgroundMusic?: BackgroundMusicSelection
  packRules?: Record<string, unknown>
  processRules?: Record<string, unknown>
  recommendationContext?: ApiPackagingRecommendationContext | null
  videoType?: string
}): Promise<ApiVideoProductionPlan> {
  const payload = await request<{ data: ApiVideoProductionPlan }>("/api/production-plans", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function listProductionPlans(): Promise<ApiVideoProductionPlan[]> {
  const payload = await request<{ data: { results: ApiVideoProductionPlan[] } }>("/api/production-plans")
  return payload.data.results
}

export async function generatePackagingMaterialSuggestions(input: {
  scriptId: string
  structureId?: string
  scriptContentDraft?: string
  packagingTemplateId: string
  existingItems?: MaterialAssignment[]
  maxCount?: number
}): Promise<PackagingMaterialSuggestionsResponse> {
  const payload = await request<{ data: PackagingMaterialSuggestionsResponse }>(
    "/api/packaging-material-suggestions",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
  return payload.data
}

export async function getPexelsMedia(pexelsId: number, provider: "pexels" | "pixabay" = "pexels") {
  const qs = provider === "pixabay" ? `?provider=pixabay` : "";
  const payload = await request<{
    data: {
      ossStatus: string
      ossUrl: string | null
      srcJson?: unknown
      imageUrl?: string | null
      videoPicturesJson?: unknown
    }
  }>(`/api/pexels/media/${pexelsId}${qs}`)
  return payload.data
}

// ─── Topic Engine (v5.0) ─────────────────────────────────

export async function generateTopics(
  input?: {
    projectId?: string
    knowledgeEntryIds?: string[]
    elementCodes?: string[]
    refreshCount?: number
    recommendationMode?: ApiTopicRecommendationMode
  },
): Promise<ApiTopicGenerateResponse> {
  const body: Record<string, unknown> = {}
  if (input?.projectId) body.projectId = input.projectId
  if (input?.knowledgeEntryIds?.length) body.knowledgeEntryIds = input.knowledgeEntryIds
  if (input?.elementCodes) body.elementCodes = input.elementCodes
  if (typeof input?.refreshCount === "number") body.refreshCount = input.refreshCount
  if (input?.recommendationMode) body.recommendationMode = input.recommendationMode
  const payload = await request<{ data: ApiTopicGenerateResponse }>(
    "/api/topics/generate",
    {
      method: "POST",
      body: JSON.stringify(body),
      timeout: 60000,
    }
  )
  return payload.data
}

export type TopicChatResponse = {
  classification: { category: string; reason: string }
  knowledgeEntry: { id: string; category: string; title: string }
  topicSelectionId: string
  cards: ApiTopicCard[]
  reply: {
    summary: string
    recommendedTitle: string
    opening: string
    alternatives: string[]
    nextActionLabel: string
  }
}

export async function sendTopicChatMessage(input: {
  projectId: string
  content: string
}): Promise<TopicChatResponse> {
  return request<TopicChatResponse>("/api/topics/chat", {
    method: "POST",
    body: JSON.stringify(input),
    timeout: 60000,
  })
}

export async function selectTopic(
  topicSelectionId: string,
  selectedIndex: number
): Promise<ApiTopicSelectResponse> {
  const payload = await request<{ data: ApiTopicSelectResponse }>(
    `/api/topics/${topicSelectionId}/select`,
    {
      method: "POST",
      body: JSON.stringify({ selectedIndex }),
    }
  )
  return payload.data
}

export async function listOpeningTypes(): Promise<ApiOpeningType[]> {
  const payload = await request<{ data: ApiOpeningType[] }>("/api/topics/opening-types")
  return payload.data
}

export async function listCopyStructures(): Promise<ApiCopyStructure[]> {
  const payload = await request<{ data: ApiCopyStructure[] }>("/api/topics/copy-structures")
  return payload.data
}

export async function listEndingTypes(): Promise<ApiEndingType[]> {
  const payload = await request<{ data: ApiEndingType[] }>("/api/topics/ending-types")
  return payload.data
}

// ─── Today Topics Cache ─────────────────────────────────

export interface TodayTopicsResult {
  mode: "cached" | "missing"
  topicSelectionId?: string
  cards?: ApiTopicCard[]
  sourceHighlights?: Array<{
    category: string
    title: string
    content: string
  }>
  createdAt?: string
}

export async function getTodayTopics(mode: ApiTopicRecommendationMode = "daily"): Promise<TodayTopicsResult> {
  const qs = mode !== "normal" ? `?mode=${mode}` : ""
  return request<TodayTopicsResult>(`/api/topics/today${qs}`)
}

// ─── Competitor Analysis (v5.0) ──────────────────────────

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

export type ContentFormat =
  | "video_script"
  | "wechat_article"
  | "moments_post"
  | "community_message"
  | "shooting_brief"
  | "raw_copy"
  | "koubo_script"
  | "xiaohongshu_post"

export type AimTaskType =
  | "polish_copy"
  | "write_script"
  | "quality_check"
  | "repurpose"

export interface AimGenerateRequest {
  agentId?: string
  rawInput: string
  targetFormats?: ContentFormat[]
  taskType?: AimTaskType
  projectId?: string
  videoCopyExtractionId?: string
  topicTitle?: string
  topicRationale?: string
  topicType?: string
  hotTopic?: string
  polishInstruction?: string
  useMarketViralVideos?: boolean
  existingGenerationId?: string
  topicSelectionId?: string
  selectedTopicIndex?: number
  workflow?: {
    stage: import("@/lib/aim-workflow").AimWorkflowStage
    sourceGenerationId?: string
    goal?: string
    confirmed?: import("@/lib/aim-workflow").ConfirmedWorkflowBrief
  }
}

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

export async function createAimWorkflowBrief(data: {
  stage: import("@/lib/aim-workflow").AimWorkflowStage
  projectId?: string
  sourceGenerationId?: string
  goal?: string
  confirmed?: import("@/lib/aim-workflow").ConfirmedWorkflowBrief
}): Promise<AimWorkflowBriefResponse> {
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

export async function listAimHistory(page = 1, pageSize = 20, projectId?: string, agentId?: string): Promise<AimGeneration[]> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (projectId) params.set("projectId", projectId)
  if (agentId) params.set("agentId", agentId)
  return request<AimGeneration[]>(`/api/aim/history?${params.toString()}`)
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

export async function listClientProjects(status = "active"): Promise<ClientProject[]> {
  return request<ClientProject[]>(`/api/projects?status=${encodeURIComponent(status)}`)
}

export async function createClientProject(data: CreateClientProjectRequest): Promise<ClientProject> {
  return request<ClientProject>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateClientProject(id: string, data: Partial<CreateClientProjectRequest> & { status?: string }): Promise<ClientProject> {
  return request<ClientProject>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function updateAimWorkflowStatus(id: string, data: {
  workflowStatus?: string
  reviewNote?: string
  publishPlatform?: string
  publishUrl?: string
  decisionSnapshot?: AimDecisionSnapshot
  retroSnapshot?: AimRetroSnapshot
  calibrationRule?: AimCalibrationRule
}): Promise<AimGeneration> {
  return request<AimGeneration>(`/api/aim/history/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

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

export async function upsertContentOutcome(
  generationId: string,
  body: ContentOutcomeInput,
): Promise<{ outcome: ContentOutcome }> {
  return request(`/api/aim/history/${encodeURIComponent(generationId)}/outcome`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export async function getContentOutcome(
  generationId: string,
): Promise<{ outcomes: ContentOutcome[]; topicSelectionId?: string | null; projectId?: string | null }> {
  return request(`/api/aim/history/${encodeURIComponent(generationId)}/outcome`, { method: "GET" })
}

export async function transcribeAudio(audioBlob: Blob): Promise<{ text: string }> {
  return request<{ text: string }>("/api/aim/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: audioBlob,
  })
}

export async function uploadKnowledgeDocument(
  file: File,
  category: string
): Promise<{ created: number; entries: KnowledgeEntry[] }> {
  const token = useAuthStore.getState().token || getStoredAuthToken()

  const formData = new FormData()
  formData.append("file", file)
  formData.append("category", category)

  const response = await fetch("/api/knowledge/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    // 不设置 Content-Type，让浏览器自动处理 multipart boundary
  })

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clearSession()
    }
    const payload = await response.json().catch(() => null)
    throw new ApiError(
      typeof payload?.error === "string" ? payload.error : `上传失败: ${response.status}`,
      response.status,
      payload
    )
  }

  return response.json().catch(() => ({ created: 0, entries: [] }))
}

export interface AimChatMessage {
  role: "user" | "assistant"
  content: AimChatContent
}

export type AimChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >

export interface AimEditorContext {
  action: string
  referenceSelection?: string
  draftSelection?: string
  draftText?: string
}

export type AimChatToolAction =
  | "import_lark_topics"
  | "import_lark_project_data"
  | "import_lark_archive_data"
  | "export_lark_generation"

export async function chatAim(
  messages: AimChatMessage[],
  options?: {
    agentId?: string
    projectId?: string
    toolAction?: AimChatToolAction
    resultId?: string
    editorContext?: AimEditorContext
    signal?: AbortSignal
  },
): Promise<{ content: string; toolResult?: unknown }> {
  const { signal, ...bodyOptions } = options ?? {}
  return request<{ content: string; toolResult?: unknown }>("/api/aim/chat", {
    method: "POST",
    body: JSON.stringify({ messages, ...bodyOptions }),
    timeout: 30000,
    signal,
  })
}

export async function chatAimStream(
  messages: AimChatMessage[],
  options: {
    agentId?: string
    projectId?: string
    editorContext?: AimEditorContext
    signal?: AbortSignal
    onDelta: (delta: string, content: string) => void
  },
): Promise<{ content: string }> {
  const { signal, onDelta, ...bodyOptions } = options
  const token = useAuthStore.getState().token || getStoredAuthToken()
  let response: Response
  try {
    response = await fetch("/api/aim/chat", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages, ...bodyOptions, stream: true }),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("请求已停止", 499, { code: "ABORTED", originalPath: "/api/aim/chat" })
    }
    throw error
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    const payload = text
      ? (() => {
          try {
            return JSON.parse(text) as unknown
          } catch {
            return { error: text }
          }
        })()
      : null

    if (response.status === 401) {
      useAuthStore.getState().clearSession()
    }

    throw new ApiError(
      getApiErrorMessage(payload, response.status, response.statusText),
      response.status,
      payload
    )
  }

  if (!response.body) {
    throw new ApiError("当前浏览器不支持流式输出", 500, { code: "NO_STREAM_BODY" })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let content = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const delta = decoder.decode(value, { stream: true })
      if (!delta) continue
      content += delta
      onDelta(delta, content)
    }
    const tail = decoder.decode()
    if (tail) {
      content += tail
      onDelta(tail, content)
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("请求已停止", 499, { code: "ABORTED", originalPath: "/api/aim/chat" })
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  return { content }
}

// ─── Inspiration（灵感收集） ─────────────────────────────

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

export async function listInspirations(status?: string): Promise<{ items: InspirationItem[] }> {
  const params = new URLSearchParams()
  if (status) params.set("status", status)
  return request<{ items: InspirationItem[] }>(`/api/inspiration?${params}`)
}

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

export async function processInspiration(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/inspiration/${id}/process`, {
    method: "POST",
  })
}

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

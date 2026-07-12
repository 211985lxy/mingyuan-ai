"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import { getStoredAuthToken } from "@/lib/auth-storage"
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

// Topic generation may wait for a primary provider timeout before the fallback
// finishes. Keep the browser request alive long enough to receive that result.

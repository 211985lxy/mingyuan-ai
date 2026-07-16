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

// ─── Topic Engine (v5.0) ─────────────────────────────────

// Topic generation may wait for a primary provider timeout before the fallback
// finishes. Keep the browser request alive long enough to receive that result.

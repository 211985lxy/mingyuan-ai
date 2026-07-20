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

/**
 * @description 列出assets
 * @param assetType? - assetType?
 * @returns Promise<ApiAsset[]>
 */
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

/**
 * @description 创建assetuploadurl
 * @param fileName - 文件名称
 * @param contentType - 内容类型
 * @returns 无返回值
 */
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

/**
 * @description 上传filetostorage
 * @param file - 文件
 * @returns 无返回值
 */
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

/**
 * @description 上传imageforaimchat
 * @param file - 文件
 * @returns 无返回值
 */
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

/**
 * @description 注册asset
 * @param input - 输入数据
 * @returns Promise<ApiAsset>
 */
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

/**
 * @description 删除asset
 * @param id - 唯一标识符
 * @returns Promise<void>
 */
export async function deleteAsset(id: string): Promise<void> {
  await request(`/api/assets/${id}`, {
    method: "DELETE",
  })
}

// ─── Topic Engine (v5.0) ─────────────────────────────────

// Topic generation may wait for a primary provider timeout before the fallback
// finishes. Keep the browser request alive long enough to receive that result.

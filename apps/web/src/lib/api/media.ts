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
 * @description 申请 OSS PostObject 上传预约（需 sizeBytes + assetType）
 */
export async function createAssetUploadUrl(
  fileName: string,
  contentType: string,
  options: { sizeBytes: number; assetType: "image" | "document" | "audio" | "video" },
) {
  const payload = await request<{
    data: {
      uploadId: string
      method: "POST"
      uploadUrl: string
      fields: Record<string, string>
      assetUrl: string
      expiresAt: string
      maxBytes: number
      readUrl?: string
    }
  }>("/api/assets/upload-url", {
    method: "POST",
    body: JSON.stringify({
      fileName,
      contentType,
      sizeBytes: options.sizeBytes,
      assetType: options.assetType,
    }),
  })

  return payload.data
}

/**
 * @description 确认直传完成并登记 Asset
 */
export async function completeAssetUpload(
  uploadId: string,
  options?: { name?: string },
) {
  const payload = await request<{ data: ApiAsset & { readUrl?: string } }>(
    `/api/assets/uploads/${encodeURIComponent(uploadId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify({ name: options?.name }),
    },
  )
  return payload.data
}

function inferUploadAssetType(
  file: File,
  preferred?: "image" | "document" | "audio" | "video",
): "image" | "document" | "audio" | "video" {
  if (preferred) return preferred
  const type = file.type || ""
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("video/")) return "video"
  if (type.startsWith("audio/")) return "audio"
  return "document"
}

async function postFileToOss(
  uploadUrl: string,
  fields: Record<string, string>,
  file: File,
): Promise<void> {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value)
  }
  // OSS PostObject: file 字段必须最后
  form.append("file", file)
  const upload = await fetch(uploadUrl, { method: "POST", body: form })
  if (!upload.ok) {
    throw new ApiError("Failed to upload file", upload.status, null)
  }
}

/** 同源代理上传兜底：直传 OSS 被跨域/网络拦截（fetch 抛 TypeError）时走自家服务器。 */
async function putFileViaProxy(uploadId: string, file: File): Promise<void> {
  const form = new FormData()
  form.append("file", file)
  const response = await fetch(`/api/assets/uploads/${encodeURIComponent(uploadId)}/put`, {
    method: "POST",
    body: form,
  })
  if (!response.ok) {
    const data: { error?: string } | null = await response.json().catch(() => null)
    throw new ApiError(data?.error || "文件上传失败", response.status, null)
  }
}

/**
 * @description 预约 → POST 直传 OSS → complete 登记
 */
export async function uploadFileToStorage(
  file: File,
  options?: {
    assetType?: "image" | "document" | "audio" | "video"
    name?: string
    register?: boolean
  },
) {
  const assetType = inferUploadAssetType(file, options?.assetType)
  const signed = await createAssetUploadUrl(
    file.name,
    file.type || "application/octet-stream",
    { sizeBytes: file.size, assetType },
  )
  try {
    await postFileToOss(signed.uploadUrl, signed.fields, file)
  } catch (error) {
    // 网络层失败（跨域拦截/断网）走同源代理；OSS 明确报错则原样抛出
    if (error instanceof TypeError) {
      await putFileViaProxy(signed.uploadId, file)
    } else {
      throw error
    }
  }

  if (options?.register === false) {
    return { assetUrl: signed.assetUrl, uploadId: signed.uploadId, asset: null }
  }

  const asset = await completeAssetUpload(signed.uploadId, {
    name: options?.name ?? file.name.replace(/\.[^.]+$/, ""),
  })
  return { assetUrl: asset.url, uploadId: signed.uploadId, asset }
}

/**
 * @description 上传 AIM 聊天图片（完成登记）
 */
export async function uploadImageForAimChat(file: File) {
  const result = await uploadFileToStorage(file, {
    assetType: "image",
    register: true,
  })
  return {
    assetUrl: result.assetUrl,
    // 私有桶：complete 返回的签名读 URL（预览与模型 image_url 都用它）
    readUrl: result.asset?.readUrl ?? result.assetUrl,
    uploadId: result.uploadId,
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
  uploadId?: string
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

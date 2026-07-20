import { env } from "@/env"
import { assertSupportedVideoUrl } from "@/lib/video-text-extractor"

export type FallbackExtractionResult = {
  status: "extracting" | "completed" | "failed"
  jobId: string
  title?: string
  coverUrl?: string
  durationSeconds?: number
  mediaSizeBytes?: number
  transcript?: string
  errorMessage?: string
}

function config() {
  const enabled = env.VIDEO_EXTRACT_FALLBACK_ENABLED === "true"
  const baseUrl = env.VIDEO_EXTRACT_FALLBACK_URL?.trim().replace(/\/$/, "")
  const apiKey = env.VIDEO_EXTRACT_FALLBACK_API_KEY?.trim()
  if (!enabled || !baseUrl || !apiKey) return null
  return { baseUrl, apiKey }
}

/**
 * @description 判断是否videoextractionfallbackenabled
 * @returns 无返回值
 */
export function isVideoExtractionFallbackEnabled() {
  return config() !== null
}

async function request(path: string, init?: RequestInit) {
  const current = config()
  if (!current) throw new Error("VIDEO_FALLBACK_NOT_CONFIGURED")
  const response = await fetch(`${current.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${current.apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json() as FallbackExtractionResult & { detail?: string }
  if (!response.ok) throw new Error(payload.detail || payload.errorMessage || `VIDEO_FALLBACK_HTTP_${response.status}`)
  return payload
}

/**
 * @description 提交fallbackvideoextraction
 * @param sourceUrl - 来源URL 地址
 * @returns 无返回值
 */
export async function submitFallbackVideoExtraction(sourceUrl: string) {
  const url = assertSupportedVideoUrl(sourceUrl)
  return request("/jobs", { method: "POST", body: JSON.stringify({ url, maxDurationSeconds: 600, maxBytes: 200 * 1024 * 1024 }) })
}

/**
 * @description 请求获取fallbackvideoextraction
 * @param jobId - 作业唯一标识符
 * @returns 无返回值
 */
export async function fetchFallbackVideoExtraction(jobId: string) {
  return request(`/jobs/${encodeURIComponent(jobId)}`)
}

/**
 * @description assertfallbackresultlimits
 * @param result - 结果
 * @returns 无返回值
 */
export function assertFallbackResultLimits(result: Pick<FallbackExtractionResult, "durationSeconds" | "mediaSizeBytes">) {
  if (result.durationSeconds && result.durationSeconds > 600) throw new Error("视频超过10分钟，暂不支持自动收录。")
  if (result.mediaSizeBytes && result.mediaSizeBytes > 200 * 1024 * 1024) throw new Error("视频超过200MB，暂不支持自动收录。")
}

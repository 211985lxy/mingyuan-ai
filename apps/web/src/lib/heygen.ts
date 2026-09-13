import { env } from "@/env"
import { logger } from "./logger"
import { externalApiDuration, externalApiRequestsTotal } from "./metrics"

/**
 * HeyGen External API 客户端（v3）。
 *
 * 规范来源：https://developers.heygen.com/openapi/external-api.json
 * base：https://api.heygen.com，鉴权：`X-Api-Key` 请求头。
 * 全部路径以 /v3 开头（v2 的 /v2/video/generate 为旧链路，本模块不使用）。
 */

const log = logger.child({ component: "heygen" })

const BASE_URL = env.HEYGEN_BASE_URL || "https://api.heygen.com"
const API_KEY = env.HEYGEN_API_KEY || ""

export class HeygenError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message)
    this.name = "HeygenError"
  }
}

export function isHeygenConfigured(): boolean {
  return Boolean(API_KEY)
}

function assertConfigured(): void {
  if (!isHeygenConfigured()) {
    throw new HeygenError("HEYGEN_NOT_CONFIGURED", "HeyGen 数字人服务暂未配置，请联系管理员")
  }
}

type HeygenEnvelope<T> = {
  data?: T
  error?: { code?: string | number; message?: string } | string | null
  message?: string
}

/**
 * HeyGen 的错误体形态不统一：既可能是 HTTP 非 2xx + {error:{code,message}}，
 * 也可能是 HTTP 200 但带 error 字段。两种都按失败处理，避免把错误当成功返回。
 */
function extractError(json: HeygenEnvelope<unknown>): { code: string; message: string } | null {
  const err = json?.error
  if (!err) return null
  if (typeof err === "string") return { code: "HEYGEN_ERROR", message: err }
  return {
    code: err.code !== undefined ? String(err.code) : "HEYGEN_ERROR",
    message: err.message || json.message || "HeyGen 服务异常，请稍后重试",
  }
}

export async function request<T>(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  options?: { body?: unknown; params?: Record<string, string>; timeoutMs?: number },
): Promise<T> {
  assertConfigured()

  const url = new URL(`${BASE_URL}${path}`)
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, value)
    }
  }

  const controller = new AbortController()
  const timeout = options?.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null
  const startTime = Date.now()

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        "X-Api-Key": API_KEY,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    })
  } catch (error) {
    if (timeout) clearTimeout(timeout)
    externalApiDuration.observe({ service: "heygen", endpoint: path }, (Date.now() - startTime) / 1000)
    if (error instanceof Error && error.name === "AbortError") {
      throw new HeygenError("HEYGEN_TIMEOUT", "HeyGen 服务响应超时，请稍后重试")
    }
    throw error
  }

  if (timeout) clearTimeout(timeout)
  externalApiDuration.observe({ service: "heygen", endpoint: path }, (Date.now() - startTime) / 1000)

  const requestId = res.headers.get("x-request-id") ?? undefined
  let json: HeygenEnvelope<T>
  try {
    json = (await res.json()) as HeygenEnvelope<T>
  } catch {
    externalApiRequestsTotal.inc({ service: "heygen", endpoint: path, status: String(res.status) })
    throw new HeygenError("HEYGEN_BAD_RESPONSE", `HeyGen 返回了无法解析的响应（HTTP ${res.status}）`, requestId)
  }

  const errorInfo = extractError(json)
  if (!res.ok || errorInfo) {
    const code = errorInfo?.code ?? String(res.status)
    const message = errorInfo?.message ?? `HeyGen 请求失败（HTTP ${res.status}）`
    externalApiRequestsTotal.inc({ service: "heygen", endpoint: path, status: code })
    log.warn({ path, method, status: res.status, code }, "HeyGen API error")
    throw new HeygenError(code, message, requestId)
  }

  externalApiRequestsTotal.inc({ service: "heygen", endpoint: path, status: "ok" })
  return json.data as T
}

// ─── 账号与配额 ──────────────────────────────────────────

export type HeygenUserMe = {
  username: string
  email: string | null
  first_name: string | null
  last_name: string | null
  billing_type?: string
  wallet?: unknown
  subscription?: unknown
  usage_based?: unknown
}

export async function getUserMe(): Promise<HeygenUserMe> {
  return request<HeygenUserMe>("GET", "/v3/users/me", { timeoutMs: 15_000 })
}

// ─── 数字人（avatars）─────────────────────────────────────

export type HeygenAvatar = {
  id: string
  name: string
  preview_image_url?: string | null
  preview_video_url?: string | null
  gender?: string | null
  created_at?: number
  looks_count?: number
  default_voice_id?: string | null
  /** 供应商侧的授权状态：未通过授权的形象不应用于出片 */
  consent_status?: string | null
  status?: string | null
  error?: unknown
}

export async function listAvatars(input?: { limit?: number; token?: string }): Promise<HeygenAvatar[]> {
  const data = await request<{ data: HeygenAvatar[]; has_more?: boolean; next_token?: string | null }>(
    "GET",
    "/v3/avatars",
    { params: { limit: input?.limit ? String(input.limit) : "50", token: input?.token ?? "" }, timeoutMs: 20_000 },
  )
  return data.data ?? []
}

export type HeygenAvatarLook = {
  id: string
  name?: string | null
  group_id?: string | null
  preview_image_url?: string | null
  preview_video_url?: string | null
  status?: string | null
}

export async function listAvatarLooks(input?: { groupId?: string; limit?: number }): Promise<HeygenAvatarLook[]> {
  const data = await request<{ data: HeygenAvatarLook[] }>("GET", "/v3/avatars/looks", {
    params: {
      group_id: input?.groupId ?? "",
      limit: input?.limit ? String(input.limit) : "50",
    },
    timeoutMs: 20_000,
  })
  return data.data ?? []
}

// ─── 声音（voices）────────────────────────────────────────

export type HeygenVoice = {
  voice_id: string
  name: string
  language: string
  gender: string
  preview_audio_url?: string | null
  support_pause?: boolean
  support_locale?: boolean
  type?: string
}

export async function listVoices(input?: { limit?: number; token?: string }): Promise<HeygenVoice[]> {
  const data = await request<{ data: HeygenVoice[] }>("GET", "/v3/voices", {
    params: { limit: input?.limit ? String(input.limit) : "50", token: input?.token ?? "" },
    timeoutMs: 20_000,
  })
  return data.data ?? []
}

// ─── 视频出片 ────────────────────────────────────────────

export type HeygenVideoStatus = "pending" | "processing" | "completed" | "failed"

export type HeygenVideo = {
  id: string
  title?: string | null
  status: HeygenVideoStatus
  created_at?: number | null
  completed_at?: number | null
  video_url?: string | null
  thumbnail_url?: string | null
  duration?: number | null
  failure_code?: string | null
  failure_message?: string | null
}

/**
 * 提交出片任务。两种驱动二选一：
 * - 脚本驱动：script + voice_id（HeyGen 侧 TTS）
 * - 音频驱动：audio_url（公开 HTTPS，自有语音经 OSS 签名后传入）
 */
export type HeygenCreateVideoInput = {
  type: "avatar"
  avatar_id: string
  script?: string
  voice_id?: string
  audio_url?: string
  audio_asset_id?: string
  title?: string
  aspect_ratio?: "16:9" | "9:16" | "1:1" | "auto"
  resolution?: "720p" | "1080p"
  output_format?: "mp4" | "webm"
  callback_url?: string
  callback_id?: string
}

export type HeygenSubmitResult = {
  taskId: string
  payload: Record<string, unknown>
}

export async function createVideo(input: HeygenCreateVideoInput): Promise<HeygenSubmitResult> {
  const body: Record<string, unknown> = { ...input }
  // 二选一互斥：两者同传会被供应商拒绝，这里提前收口
  if (input.audio_url || input.audio_asset_id) {
    delete body.script
  } else {
    delete body.audio_url
    delete body.audio_asset_id
  }
  if (!body.aspect_ratio) delete body.aspect_ratio
  if (!body.resolution) delete body.resolution
  if (!body.callback_url) delete body.callback_url

  const data = await request<{ video_id: string; status: string; output_format?: string }>(
    "POST",
    "/v3/videos",
    { body, timeoutMs: 30_000 },
  )
  return { taskId: data.video_id, payload: { provider: "heygen", endpoint: "/v3/videos", ...body } }
}

export async function getVideo(videoId: string): Promise<HeygenVideo> {
  return request<HeygenVideo>("GET", `/v3/videos/${encodeURIComponent(videoId)}`, { timeoutMs: 15_000 })
}

export async function deleteVideo(videoId: string): Promise<void> {
  await request<unknown>("DELETE", `/v3/videos/${encodeURIComponent(videoId)}`, { timeoutMs: 15_000 })
}

// ─── 任务结果映射（与蝉镜/闪剪共用 TaskResult 契约）──────

export type HeygenTaskResult = {
  status: "processing" | "succeed" | "failed"
  progress?: number
  result?: { videoUrl?: string; coverUrl?: string; duration?: number }
  errorCode?: string
  errorMessage?: string
}

export function mapHeygenVideoToTaskResult(video: HeygenVideo): HeygenTaskResult {
  if (video.status === "completed") {
    return {
      status: "succeed",
      progress: 100,
      result: {
        videoUrl: video.video_url ?? undefined,
        coverUrl: video.thumbnail_url ?? undefined,
        duration: video.duration ?? undefined,
      },
    }
  }
  if (video.status === "failed") {
    return {
      status: "failed",
      // failure_code 与 failure_message 语义不同：前者用于归因，后者面向用户
      errorCode: video.failure_code ?? "HEYGEN_VIDEO_FAILED",
      errorMessage: video.failure_message || "HeyGen 出片失败，请稍后重试",
    }
  }
  return { status: "processing" }
}

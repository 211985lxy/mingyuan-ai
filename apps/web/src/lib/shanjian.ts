import { env } from "@/env"
import { withCache } from "./cache"
import { logger } from "./logger"
import { externalApiRequestsTotal, externalApiDuration } from "./metrics"

const log = logger.child({ component: "shanjian" })
import type {
  ShanjianResponse,
  ShanjianTaskResponse,
  ShanjianVoice,
  ShanjianVirtualman,
  ShanjianTemplate,
  ShanjianTemplateDetail,
  ShanjianCoverTemplate,
  ProfessionalCloneRequest,
  FastCloneRequest,
  ImageCloneRequest,
  VoiceCloneRequest,
  TTSRequest,
  ASRRequest,
  VirtualmanVideoRequest,
  VirtualmanBroadcastRequest,
  RealmanBroadcastRequest,
  CustomRealmanBroadcastRequest,
  MaterialMixcutRequest,
  NewsMixcutRequest,
  CustomVirtualmanBroadcastRequest,
  CustomMaterialMixcutRequest,
  AICoverRequest,
  TaskResult,
} from "@/types/shanjian"

// ─── Config ─────────────────────────────────────────────

const BASE_URL = env.SHANJIAN_BASE_URL || "https://openapi.shanjian.tv"
const APP_KEY = env.SHANJIAN_APP_KEY || ""
const WEBHOOK_URL = env.SHANJIAN_WEBHOOK_URL || ""

// ─── Error Mapping (spec 3.7) ───────────────────────────

const ERROR_MAP: Record<string, { status: number; code: string; message: string }> = {
  "Invalid.Authorization":     { status: 401, code: "SHANJIAN_AUTH_FAILED",    message: "服务认证失败，请联系管理员检查系统配置" },
  "Invalid.TrainAuth":         { status: 422, code: "INVALID_AUTH_VIDEO",       message: "授权视频验证失败" },
  "Request.Limit":             { status: 429, code: "RATE_LIMITED",             message: "请求过于频繁，请稍后重试" },
  "Concurrency.Limit":         { status: 429, code: "CONCURRENCY_EXCEEDED",     message: "并发任务数已满，请排队等候" },
  "Account.NotExist":          { status: 403, code: "SHANJIAN_ACCOUNT_ERROR",   message: "服务账户异常，请稍后重试" },
  "Resource.NotExist":         { status: 404, code: "RESOURCE_NOT_FOUND",       message: "数字人或声音资源不存在" },
  "Resource.Disable":          { status: 403, code: "RESOURCE_DISABLED",        message: "资源已被禁用" },
  "Task.NotExist":             { status: 404, code: "TASK_NOT_FOUND",           message: "任务不存在" },
  "Invalid.File.Format":       { status: 422, code: "INVALID_FILE_FORMAT",      message: "文件格式不符合要求" },
  "Invalid.File.Resolution":   { status: 422, code: "INVALID_FILE_RESOLUTION",  message: "文件分辨率超限" },
  "Invalid.File.Duration":     { status: 422, code: "INVALID_FILE_DURATION",    message: "文件时长不符合要求" },
  "Invalid.File.Size":         { status: 422, code: "INVALID_FILE_SIZE",        message: "文件大小超限" },
  "Invalid.File.FPS":          { status: 422, code: "INVALID_FILE_FPS",         message: "帧率不符合要求" },
  "Invalid.File.Codec":        { status: 422, code: "INVALID_FILE_CODEC",       message: "编码格式不支持" },
  "Invalid.File.Audio":        { status: 422, code: "INVALID_AUDIO",            message: "音频检测异常" },
  "Invalid.Face.Detection":    { status: 422, code: "FACE_NOT_DETECTED",        message: "未检测到人脸" },
  "Invalid.Face.Completeness": { status: 422, code: "FACE_INCOMPLETE",          message: "人脸不完整（侧脸/遮挡）" },
  "Invalid.Speech":            { status: 422, code: "SPEECH_QUALITY_LOW",       message: "语音质量不达标" },
  "Invalid.Face.Comparison":   { status: 422, code: "FACE_MISMATCH",           message: "授权视频与训练视频人脸不匹配" },
  "Failed.Timeout":            { status: 504, code: "PROCESSING_TIMEOUT",       message: "处理超时，请重试" },
  "Service.Error":             { status: 502, code: "SHANJIAN_SERVICE_ERROR",   message: "视频服务异常，请稍后重试" },
}

// ─── Error Class ────────────────────────────────────────

export class ShanjianError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string
  ) {
    super(message)
    this.name = "ShanjianError"
  }
}

// ─── Base Request ───────────────────────────────────────

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options?: { body?: unknown; params?: Record<string, string>; timeoutMs?: number }
): Promise<T> {
  if (!APP_KEY) {
    throw new ShanjianError(
      "SHANJIAN_NOT_CONFIGURED",
      "视频服务暂未配置，请联系管理员"
    )
  }

  const url = new URL(path, BASE_URL)
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v)
    }
  }

  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs
  const timeout = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null

  const startTime = Date.now()
  let res: Response
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${APP_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    })
  } catch (error) {
    if (timeout) clearTimeout(timeout)
    const durationSec = (Date.now() - startTime) / 1000
    externalApiDuration.observe({ service: "shanjian", endpoint: path }, durationSec)

    if (error instanceof Error && error.name === "AbortError") {
      externalApiRequestsTotal.inc({ service: "shanjian", endpoint: path, status: "timeout" })
      log.error({ path, method, durationSec, timeoutMs }, "Shanjian API timeout")
      throw new ShanjianError(
        "SHANJIAN_TIMEOUT",
        "视频服务响应超时，请稍后重试"
      )
    }
    externalApiRequestsTotal.inc({ service: "shanjian", endpoint: path, status: "error" })
    log.error({ path, method, durationSec, error: error instanceof Error ? error.message : "unknown" }, "Shanjian API network error")
    throw error
  }

  if (timeout) clearTimeout(timeout)
  const durationSec = (Date.now() - startTime) / 1000
  externalApiDuration.observe({ service: "shanjian", endpoint: path }, durationSec)

  const json = (await res.json()) as ShanjianResponse<T>

  if (json.code !== "Succeed") {
    externalApiRequestsTotal.inc({ service: "shanjian", endpoint: path, status: json.code })
    log.warn({ path, method, durationSec, code: json.code, requestId: json.requestId }, "Shanjian API error response")
    const mapped = ERROR_MAP[json.code]
    if (mapped) {
      throw new ShanjianError(mapped.code, mapped.message, json.requestId)
    }
    const upstreamMessage =
      typeof json.message === "string" && json.message.trim().length > 0
        ? json.message.trim()
        : "视频服务异常，请稍后重试"
    throw new ShanjianError(
      json.code,
      upstreamMessage,
      json.requestId
    )
  }

  externalApiRequestsTotal.inc({ service: "shanjian", endpoint: path, status: "ok" })
  log.debug({ path, method, durationSec, requestId: json.requestId }, "Shanjian API success")

  return json.data
}

// ─── Helper: append webhook callbackUrl to body ─────────

function withCallback<T extends Record<string, unknown>>(body: T): T {
  if (WEBHOOK_URL) {
    return { ...body, callbackUrl: WEBHOOK_URL }
  }
  return body
}

function stripNullishDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripNullishDeep(item))
      .filter((item) => item !== null && item !== undefined) as T
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([key, item]) => [key, stripNullishDeep(item)] as const)

    return Object.fromEntries(entries) as T
  }

  return value
}

// ─── Helper: submit task and return taskId + payload ────

export interface ShanjianSubmitResult {
  taskId: string
  /** The exact sanitized payload sent to Shanjian (excluding callbackUrl) */
  payload: Record<string, unknown>
}

async function submitTask(
  path: string,
  body: Record<string, unknown>,
  options?: { withCallback?: boolean; timeoutMs?: number }
): Promise<ShanjianSubmitResult> {
  const sanitizedBody = stripNullishDeep(body)
  const data = await request<ShanjianTaskResponse>("POST", path, {
    body: options?.withCallback === false
      ? sanitizedBody
      : withCallback(sanitizedBody),
    timeoutMs: options?.timeoutMs,
  })
  return {
    taskId: data.taskId,
    payload: { endpoint: path, ...sanitizedBody },
  }
}

// ─── Asset Queries (cached) ─────────────────────────────

export async function getPublicVoices(): Promise<ShanjianVoice[]> {
  return withCache("shanjian:voices", 24 * 3600, async () => {
    const data = await request<{ results: ShanjianVoice[] }>(
      "GET",
      "/v1/assets/voice/common"
    )
    return data.results
  })
}

export async function getPublicVirtualmen(): Promise<ShanjianVirtualman[]> {
  return withCache("shanjian:virtualmen", 24 * 3600, async () => {
    const data = await request<{ results: ShanjianVirtualman[] }>(
      "GET",
      "/v1/assets/virtualman/common"
    )
    return data.results
  })
}

export async function getTemplates(
  scene: "virtualman" | "realMan" | "oralMixCutting" | "newsMixCutting",
  options?: {
    pageSize?: number
    sid?: string
    searchKey?: string
    searchValue?: string
    sortBy?: "desc" | "asc"
  }
): Promise<{ results: ShanjianTemplate[]; sid: string }> {
  const params: Record<string, string> = {
    scene,
    pageSize: String(options?.pageSize ?? 100),
  }
  if (options?.sid) params.sid = options.sid
  if (options?.searchKey) params.searchKey = options.searchKey
  if (options?.searchValue) params.searchValue = options.searchValue
  if (options?.sortBy) params.sortBy = options.sortBy

  const cacheKey = `shanjian:templates:${scene}:${params.pageSize}:${params.sid ?? ""}:${params.searchKey ?? ""}:${params.searchValue ?? ""}:${params.sortBy ?? ""}`

  return withCache(cacheKey, 6 * 3600, async () => {
    return request<{ results: ShanjianTemplate[]; sid: string }>(
      "GET",
      "/v1/clip/template",
      { params }
    )
  })
}

export async function getTemplateDetail(
  templateId: string
): Promise<ShanjianTemplateDetail> {
  return request<ShanjianTemplateDetail>(
    "GET",
    `/v1/clip/template/detail/${templateId}`
  )
}

export async function getCoverTemplates(
  options?: { pageSize?: number; sid?: string }
): Promise<{ results: ShanjianCoverTemplate[]; sid: string }> {
  const params: Record<string, string> = {
    pageSize: String(options?.pageSize ?? 100),
  }
  if (options?.sid) params.sid = options.sid

  return request<{ results: ShanjianCoverTemplate[]; sid: string }>(
    "GET",
    "/v1/clip/image/template",
    { params }
  )
}

// ─── Helper: submit and return only taskId (for non-video tasks) ─

async function submitTaskId(
  path: string,
  body: Record<string, unknown>,
  options?: { withCallback?: boolean; timeoutMs?: number }
): Promise<string> {
  const result = await submitTask(path, body, options)
  return result.taskId
}

// ─── Clone Methods ──────────────────────────────────────

export async function cloneProfessionalAvatar(
  req: ProfessionalCloneRequest
): Promise<string> {
  return submitTaskId("/v1/virtualman/train", req as unknown as Record<string, unknown>, { timeoutMs: 30000 })
}

export async function cloneFastAvatar(
  req: FastCloneRequest
): Promise<string> {
  return submitTaskId("/v1/virtualman/fast/train", req as unknown as Record<string, unknown>, { timeoutMs: 30000 })
}

export async function cloneImageAvatar(
  req: ImageCloneRequest
): Promise<string> {
  return submitTaskId("/v1/virtualman/image/train", req as unknown as Record<string, unknown>, { timeoutMs: 30000 })
}

export async function cloneVoice(
  req: VoiceCloneRequest
): Promise<string> {
  return submitTaskId("/v1/voice/train", req as unknown as Record<string, unknown>)
}

export async function deleteAsset(assetId: string): Promise<void> {
  await request<unknown>("DELETE", `/v1/assets/${assetId}`)
}

// ─── Effect Methods ─────────────────────────────────────

export async function textToSpeech(req: TTSRequest): Promise<string> {
  return submitTaskId("/v1/effect/tts", req as unknown as Record<string, unknown>)
}

export async function audioToText(req: ASRRequest): Promise<string> {
  return submitTaskId("/v1/effect/asr", req as unknown as Record<string, unknown>)
}

// ─── Video Generation Methods ───────────────────────────

export async function generateRawVideo(
  req: VirtualmanVideoRequest,
  options?: { withCallback?: boolean }
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/virtualman/video",
    req as unknown as Record<string, unknown>,
    options
  )
}

export async function generateVirtualmanBroadcast(
  req: VirtualmanBroadcastRequest
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/clip/video/virtualman_broadcast",
    req as unknown as Record<string, unknown>
  )
}

export async function generateRealmanBroadcast(
  req: RealmanBroadcastRequest
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/clip/video/realman_broadcast",
    req as unknown as Record<string, unknown>
  )
}

export async function generateCustomRealmanBroadcast(
  req: CustomRealmanBroadcastRequest
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/clip/video/custom_realman_broadcast",
    req as unknown as Record<string, unknown>
  )
}

export async function generateMaterialMixcut(
  req: MaterialMixcutRequest
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/clip/video/broadcast_mixcut",
    req as unknown as Record<string, unknown>
  )
}

export async function generateNewsMixcut(
  req: NewsMixcutRequest
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/clip/video/news_mixcut",
    req as unknown as Record<string, unknown>
  )
}

export async function generateCustomVirtualmanBroadcast(
  req: CustomVirtualmanBroadcastRequest
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/clip/video/custom_virtualman_broadcast",
    req as unknown as Record<string, unknown>
  )
}

export async function generateCustomMaterialMixcut(
  req: CustomMaterialMixcutRequest
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/clip/video/custom_broadcast_mixcut",
    req as unknown as Record<string, unknown>
  )
}

export async function generateAICover(
  req: AICoverRequest
): Promise<ShanjianSubmitResult> {
  return submitTask(
    "/v1/clip/image/ai_cover",
    req as unknown as Record<string, unknown>
  )
}

// ─── Task Query ─────────────────────────────────────────

export async function getTaskInfo(taskId: string): Promise<TaskResult> {
  return request<TaskResult>("GET", "/v1/task/info", {
    params: { taskId },
    timeoutMs: 8000,
  })
}

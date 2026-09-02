import { env } from "@/env"
import { logger } from "./logger"
import { externalApiDuration, externalApiRequestsTotal } from "./metrics"
import type {
  ChanjingAccessTokenData,
  ChanjingCustomisedPerson,
  ChanjingFileDetail,
  ChanjingResponse,
  ChanjingUploadUrlData,
  ChanjingVideoTask,
} from "@/types/chanjing"
import type { TaskResult, TaskStatus } from "@/types/shanjian"

const log = logger.child({ component: "chanjing" })

const BASE_URL = env.CHANJING_BASE_URL || "https://open-api.chanjing.cc"
const APP_ID = env.CHANJING_APP_ID || ""
const SECRET_KEY = env.CHANJING_SECRET_KEY || ""
const WEBHOOK_URL = env.CHANJING_WEBHOOK_URL || ""

let cachedToken: { token: string; expiresAt: number } | null = null

export class ChanjingError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message)
    this.name = "ChanjingError"
  }
}

export function isChanjingConfigured(): boolean {
  return Boolean(APP_ID && SECRET_KEY)
}

function assertConfigured(): void {
  if (!isChanjingConfigured()) {
    throw new ChanjingError(
      "CHANJING_NOT_CONFIGURED",
      "蝉镜数字人服务暂未配置，请联系管理员",
    )
  }
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  assertConfigured()
  if (
    !forceRefresh
    && cachedToken
    && Date.now() < cachedToken.expiresAt - 60_000
  ) {
    return cachedToken.token
  }

  const res = await fetch(`${BASE_URL}/open/v1/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, secret_key: SECRET_KEY }),
  })
  const json = (await res.json()) as ChanjingResponse<ChanjingAccessTokenData>
  if (json.code !== 0 || !json.data?.access_token) {
    throw new ChanjingError(
      String(json.code || "CHANJING_AUTH_FAILED"),
      json.msg || "蝉镜鉴权失败，请检查 app_id / secret_key",
      json.trace_id,
    )
  }

  cachedToken = {
    token: json.data.access_token,
    expiresAt: Date.now() + Math.max(json.data.expire_in, 300) * 1000,
  }
  return cachedToken.token
}

// 供同域子模块（如 chanjing-audio）复用的请求通道，业务代码勿直接使用
export async function request<T>(
  method: "GET" | "POST",
  path: string,
  options?: {
    body?: unknown
    params?: Record<string, string>
    timeoutMs?: number
    retryAuth?: boolean
  },
): Promise<T> {
  assertConfigured()
  const token = await getAccessToken()
  const url = new URL(`${BASE_URL}/open/v1${path}`)
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value)
    }
  }

  const controller = new AbortController()
  const timeout = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null
  const startTime = Date.now()

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        access_token: token,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    })
  } catch (error) {
    if (timeout) clearTimeout(timeout)
    externalApiDuration.observe({ service: "chanjing", endpoint: path }, (Date.now() - startTime) / 1000)
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChanjingError("CHANJING_TIMEOUT", "蝉镜服务响应超时，请稍后重试")
    }
    throw error
  }

  if (timeout) clearTimeout(timeout)
  externalApiDuration.observe({ service: "chanjing", endpoint: path }, (Date.now() - startTime) / 1000)

  const json = (await res.json()) as ChanjingResponse<T>
  if (json.code === 10400 && options?.retryAuth !== false) {
    cachedToken = null
    return request<T>(method, path, { ...options, retryAuth: false })
  }

  if (json.code !== 0) {
    externalApiRequestsTotal.inc({ service: "chanjing", endpoint: path, status: String(json.code) })
    log.warn({ path, method, code: json.code, traceId: json.trace_id }, "ChanJing API error")
    throw new ChanjingError(
      String(json.code),
      json.msg || "蝉镜服务异常，请稍后重试",
      json.trace_id,
    )
  }

  externalApiRequestsTotal.inc({ service: "chanjing", endpoint: path, status: "ok" })
  return json.data
}

function guessFileName(url: string, fallback: string): string {
  try {
    const base = new URL(url).pathname.split("/").pop()
    if (base && base.includes(".")) return base
  } catch {
    /* ignore malformed url */
  }
  return fallback
}

export type ChanjingFileReadiness = "pending" | "ready" | "failed"

export function classifyChanjingFileStatus(status: number): ChanjingFileReadiness {
  if (status === 1) return "ready"
  if (status === 0) return "pending"
  return "failed"
}

export async function waitForFileReady(
  fileId: string,
  options: {
    fetchDetail?: (fileId: string) => Promise<ChanjingFileDetail>
    intervalMs?: number
    maxAttempts?: number
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<void> {
  const fetchDetail = options.fetchDetail ?? (async (id: string) => request<ChanjingFileDetail>(
    "GET",
    "/common/file_detail",
    { params: { id }, timeoutMs: 8000 },
  ))
  const intervalMs = options.intervalMs ?? 5000
  const maxAttempts = options.maxAttempts ?? 13
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const detail = await fetchDetail(fileId)
    const readiness = classifyChanjingFileStatus(detail.status)
    if (readiness === "ready") return
    if (readiness === "failed") {
      throw new ChanjingError(
        "CHANJING_FILE_NOT_READY",
        detail.msg || `蝉镜文件不可用（状态 ${detail.status}）`,
      )
    }
    if (attempt < maxAttempts - 1) await sleep(intervalMs)
  }

  throw new ChanjingError(
    "CHANJING_FILE_READY_TIMEOUT",
    "蝉镜素材仍在同步，请稍后重试",
  )
}

export async function uploadFileFromUrl(
  sourceUrl: string,
  service: string,
  fallbackName: string,
): Promise<string> {
  const fileName = guessFileName(sourceUrl, fallbackName)
  const upload = await request<ChanjingUploadUrlData>("GET", "/common/create_upload_url", {
    params: { service, name: fileName },
    timeoutMs: 15000,
  })

  const sourceRes = await fetch(sourceUrl)
  if (!sourceRes.ok) {
    throw new ChanjingError(
      "UPSTREAM_FILE_FETCH_FAILED",
      `无法读取素材文件（HTTP ${sourceRes.status}）`,
    )
  }

  if (!sourceRes.body) {
    throw new ChanjingError("UPSTREAM_FILE_EMPTY", "素材文件没有可读取内容")
  }
  const uploadRequest: RequestInit & { duplex: "half" } = {
    method: "PUT",
    headers: { "Content-Type": upload.mime_type || "application/octet-stream" },
    body: sourceRes.body,
    duplex: "half",
  }
  const putRes = await fetch(upload.sign_url, uploadRequest)
  if (!putRes.ok) {
    throw new ChanjingError(
      "CHANJING_UPLOAD_FAILED",
      `蝉镜文件上传失败（HTTP ${putRes.status}）`,
    )
  }

  await waitForFileReady(upload.file_id)
  return upload.file_id
}

export async function cloneFastAvatar(input: {
  name: string
  videoUrl: string
  authVideoUrl: string
  authText: string
}): Promise<string> {
  const [fileId, authVideoFileId] = await Promise.all([
    uploadFileFromUrl(input.videoUrl, "customised_person", "avatar.mp4"),
    uploadFileFromUrl(input.authVideoUrl, "customised_person", "auth.mp4"),
  ])

  const personId = await request<string>("POST", "/create_customised_person", {
    body: {
      name: input.name,
      file_id: fileId,
      auth_video_file_id: authVideoFileId,
      auth_text: input.authText,
      version: "2.0",
      callback: WEBHOOK_URL || undefined,
      error_skip: false,
    },
    timeoutMs: 30000,
  })

  return personId
}

export async function getCustomisedPerson(personId: string): Promise<ChanjingCustomisedPerson> {
  return request<ChanjingCustomisedPerson>("GET", "/customised_person", {
    params: { id: personId },
    timeoutMs: 8000,
  })
}

export async function deleteCustomisedPerson(personId: string): Promise<void> {
  await request<string>("POST", "/delete_customised_person", {
    body: { id: personId },
    timeoutMs: 8000,
  })
}

export interface ChanjingSubmitResult {
  taskId: string
  payload: Record<string, unknown>
}

export function buildDigitalHumanVideoPayload(input: {
  personId: string
  audioManId: string
  text: string
  width?: number
  height?: number
}): Record<string, unknown> {
  const screenWidth = input.width ?? 1080
  const screenHeight = input.height ?? 1920
  const personHeight = Math.round(screenHeight * 0.75)

  return {
    person: {
      id: input.personId,
      x: 0,
      y: Math.round((screenHeight - personHeight) / 2),
      width: screenWidth,
      height: personHeight,
    },
    audio: {
      type: "tts",
      volume: 100,
      language: "cn",
      tts: {
        text: [input.text],
        speed: 1,
        audio_man: input.audioManId,
      },
    },
    bg_color: "#EDEDED",
    screen_width: screenWidth,
    screen_height: screenHeight,
    add_compliance_watermark: true,
    callback: WEBHOOK_URL || undefined,
  }
}

export async function createDigitalHumanVideo(input: {
  personId: string
  audioManId: string
  text: string
  width?: number
  height?: number
}): Promise<ChanjingSubmitResult> {
  const body = buildDigitalHumanVideoPayload(input)

  const taskId = await request<string>("POST", "/create_video", {
    body,
    timeoutMs: 30000,
  })

  return { taskId, payload: { provider: "chanjing", endpoint: "/create_video", ...body } }
}

export async function getVideoTask(videoId: string): Promise<ChanjingVideoTask> {
  return request<ChanjingVideoTask>("GET", "/video", {
    params: { id: videoId },
    timeoutMs: 8000,
  })
}

function mapPersonStatus(status: number): TaskStatus {
  if (status === 2) return "succeed"
  if (status === 4 || status === 5) return "failed"
  return "processing"
}

function mapVideoStatus(video: ChanjingVideoTask): TaskStatus {
  // 规范枚举优先；数值 status（30 成功 / >=40 失败）为旧约定，仅在
  // queue_status 缺失时兜底。
  if (video.queue_status) {
    if (video.queue_status === "completed") return "succeed"
    if (video.queue_status === "failed" || video.queue_status === "other") return "failed"
    return "processing"
  }
  if (video.status === 30) return "succeed"
  if (video.status >= 40) return "failed"
  return "processing"
}

export function mapCustomisedPersonToTaskResult(
  person: ChanjingCustomisedPerson,
): TaskResult {
  const mappedStatus = mapPersonStatus(person.status)
  return {
    taskId: person.id,
    status: mappedStatus,
    result: mappedStatus === "succeed"
      ? {
          virtualmanId: person.id,
          speakerId: person.audio_man_id,
          coverUrl: person.pic_url,
          videoUrl: person.preview_url,
        }
      : undefined,
    errorCode: mappedStatus === "failed" ? String(person.status) : undefined,
    errorMessage: mappedStatus === "failed"
      ? person.err_reason || person.reason || "数字人克隆失败"
      : undefined,
  }
}

export function mapVideoToTaskResult(video: ChanjingVideoTask): TaskResult {
  const mappedStatus = mapVideoStatus(video)
  return {
    taskId: video.id,
    status: mappedStatus,
    result: mappedStatus === "succeed"
      ? {
          videoUrl: video.video_url,
          coverUrl: video.preview_url,
          duration: video.duration,
        }
      : undefined,
    errorCode: mappedStatus === "failed" ? String(video.status) : undefined,
    errorMessage: mappedStatus === "failed"
      ? video.msg || "视频合成失败"
      : undefined,
  }
}

export async function getAvatarCloneTaskInfo(personId: string): Promise<TaskResult> {
  const person = await getCustomisedPerson(personId)
  return mapCustomisedPersonToTaskResult(person)
}

export async function getVideoTaskInfo(videoId: string): Promise<TaskResult> {
  const video = await getVideoTask(videoId)
  return mapVideoToTaskResult(video)
}


export const VIDEO_TEXT_EXTRACT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

const BASE_URL = "https://www.qingdou.vip"
const SUBMIT_PATH = "/web/api/commitGetTextTask"
const RESULT_PATH = "/web/api/getTaskResult"

export type VideoTextExtractionStatus = "extracting" | "completed" | "failed"

export interface VideoTextExtractionResult {
  status: VideoTextExtractionStatus
  platform?: string
  originalUrl?: string
  title?: string
  coverUrl?: string
  duration?: string
  transcript?: string
  providerTaskId?: string
  errorMessage?: string
}

interface ProviderTaskItem {
  awemeId?: unknown
  originLink?: unknown
  platformName?: unknown
  rowIndex?: unknown
  status?: unknown
  taskId?: unknown
  videoContent?: unknown
  videoCover?: unknown
  videoTime?: unknown
  videoTitle?: unknown
  msg?: unknown
  message?: unknown
}

interface ProviderTaskResponse {
  code?: unknown
  status?: unknown
  result?: unknown
  message?: unknown
  msg?: unknown
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return undefined
}

export function parseVideoTextSubmitResult(payload: ProviderTaskResponse): { batchId: string } {
  const result = payload.result
  const batchId =
    readString(result)
    ?? (typeof result === "number" && Number.isFinite(result) ? String(result) : undefined)
    ?? (result && typeof result === "object" ? readString((result as Record<string, unknown>).batchId) : undefined)

  if (!batchId) {
    throw new Error(readString(payload.message) ?? readString(payload.msg) ?? "submit failed")
  }
  return { batchId }
}

export function detectVideoPlatform(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes("douyin.com") || hostname.includes("iesdouyin.com")) return "douyin"
    if (hostname.includes("bilibili.com") || hostname.includes("b23.tv")) return "bilibili"
    if (hostname.includes("kuaishou.com")) return "kuaishou"
    if (hostname.includes("xiaohongshu.com") || hostname.includes("xhslink.com")) return "xiaohongshu"
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube"
    return "unknown"
  } catch {
    return "unknown"
  }
}

export function assertSupportedVideoUrl(input: string): string {
  const text = input.trim()
  const url = text.match(/https?:\/\/[^\s，。；；、"'<>]+/i)?.[0]?.replace(/[),.。]+$/, "") ?? text
  if (!url) throw new Error("请输入视频链接")

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("请输入正确的视频链接")
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("请输入正确的视频链接")
  }
  const hostname = parsed.hostname.toLowerCase()
  if (hostname.includes("douyinvod.com")) {
    throw new Error("请粘贴抖音分享页或作品页链接，不要粘贴视频文件直链")
  }
  if (
    hostname === "localhost"
    || hostname === "0.0.0.0"
    || hostname.startsWith("127.")
    || hostname.startsWith("10.")
    || hostname.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    throw new Error("请粘贴公开视频链接，不要粘贴本站地址")
  }
  return parsed.toString()
}

export function formatVideoTextExtractionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const lower = message.toLowerCase()

  if (lower.includes("1004") || lower.includes("apikey") || lower.includes("api key")) {
    return "文案提取服务配置有问题，请检查服务端密钥。"
  }
  if (
    lower.includes("balance")
    || lower.includes("quota")
    || lower.includes("额度")
    || lower.includes("余额")
    || lower.includes("充值")
  ) {
    return "文案提取额度不足，请先补充额度后再试。"
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("fetch failed")) {
    return "文案提取服务暂时不可用，请稍后重试。"
  }
  if (lower.includes("link") || lower.includes("url") || lower.includes("链接")) {
    return "这个视频链接暂时无法提取，请换一个链接试试。"
  }
  return "文案提取失败，请稍后重试。"
}

export function parseVideoTextTaskResult(payload: ProviderTaskResponse): VideoTextExtractionResult {
  const result = payload.result
  if (!result || typeof result !== "object") {
    return { status: "extracting" }
  }

  const resultRecord = result as Record<string, unknown>
  const batchStatus = readNumber(resultRecord.batchStatus)
  if (batchStatus !== 2) {
    return { status: "extracting" }
  }

  const list = Array.isArray(resultRecord.list)
    ? resultRecord.list
    : Array.isArray(resultRecord.data)
      ? resultRecord.data
      : []
  const first = list[0] as ProviderTaskItem | undefined
  if (!first || typeof first !== "object") {
    return {
      status: "failed",
      errorMessage: "该视频暂时无法提取文案，请换一个链接试试。",
    }
  }

  const itemStatus = readNumber(first.status)
  const transcript = readString(first.videoContent)
  if (itemStatus === 1000 && transcript) {
    const originalUrl = readString(first.originLink)
    const platform = readString(first.platformName) ?? (originalUrl ? detectVideoPlatform(originalUrl) : "unknown")

    return {
      status: "completed",
      platform,
      originalUrl,
      title: readString(first.videoTitle),
      coverUrl: readString(first.videoCover),
      duration: readString(first.videoTime),
      transcript,
      providerTaskId: readString(first.taskId),
    }
  }

  return {
    status: "failed",
    errorMessage: "该视频暂时无法提取文案，请换一个链接试试。",
  }
}

function getApiKey(): string {
  const apiKey = process.env.VIDEO_TEXT_EXTRACT_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("api key missing")
  }
  return apiKey
}

function getHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "user-agent": VIDEO_TEXT_EXTRACT_USER_AGENT,
    "x-api-key": getApiKey(),
  }
}

async function readJson(response: Response): Promise<ProviderTaskResponse> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `request failed: ${response.status}`)
  }
  if (!text) return {}
  return JSON.parse(text) as ProviderTaskResponse
}

export async function submitVideoTextExtractionTask(url: string): Promise<{ batchId: string }> {
  const normalizedUrl = assertSupportedVideoUrl(url)
  const response = await fetch(`${BASE_URL}${SUBMIT_PATH}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      userInputList: [{ numberIndex: 0, url: normalizedUrl }],
    }),
  })
  const payload = await readJson(response)
  return parseVideoTextSubmitResult(payload)
}

export async function fetchVideoTextExtractionResult(batchId: string): Promise<VideoTextExtractionResult> {
  const url = new URL(`${BASE_URL}${RESULT_PATH}`)
  url.searchParams.set("batchId", batchId)
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  })
  return parseVideoTextTaskResult(await readJson(response))
}

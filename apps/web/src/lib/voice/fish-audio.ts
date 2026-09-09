import { env } from "@/env"
import { resolveLlmProxyUrl } from "@/lib/llm/config"
import { getSharedProxyAgent } from "@/lib/llm/provider"

/**
 * Fish Audio TTS 服务端客户端。
 *
 * 真实契约（docs.fish.audio，2026-09 核对）：
 * - POST {base}/v1/tts，Header 带 Authorization: Bearer <key> 与 model: <档位>，
 *   请求体为 JSON（仅文本合成场景；内联参考音频需 msgpack，MVP 不涉及）。
 * - 响应体为原始音频字节（mp3 / wav / pcm / opus）。
 * - GET {base}/model?page_size=&self=&language=&sort_by= 返回 { items: [{ _id, title, ... }], total }，
 *   items[]._id 即合成时的 reference_id（音色 id）。
 * - 本机/服务器直连 api.fish.audio 可能超时（2026-09-07 实测直连超时、走代理 200），
 *   配置 FISH_AUDIO_PROXY_URL 后经 undici ProxyAgent 出站。
 */

export const FISH_AUDIO_DEFAULT_BASE_URL = "https://api.fish.audio"
/** 默认走免费开发档：与 s2.1-pro 同权重，无 TTFA / DPA 保障，适合试听与原型 */
export const FISH_AUDIO_DEFAULT_MODEL = "s2.1-pro-free"
const DEFAULT_TIMEOUT_MS = 60_000
/** 单次合成文本上限：超过由客户端分段后逐段调用（见 lib/voice/segment-text.ts） */
export const FISH_AUDIO_MAX_TEXT_LENGTH = 4000

export type FishAudioFormat = "mp3" | "wav" | "pcm" | "opus"

export interface FishAudioModelTier {
  id: string
  label: string
  note: string
}

/** 可选档位：默认免费档，付费档需要用户显式在环境变量里切换 */
export const FISH_AUDIO_MODEL_TIERS: FishAudioModelTier[] = [
  { id: "s2.1-pro-free", label: "s2.1-pro-free（免费档）", note: "与付费版同权重，无 SLA，适合试听、原型与小规模业务" },
  { id: "s2.1-pro", label: "s2.1-pro（生产档）", note: "有 TTFA / DPA 保障，适合正式投放的配音" },
  { id: "s2-pro", label: "s2-pro（上一代）", note: "80+ 语种，仅用于兼容已有音色" },
  { id: "s1", label: "s1（旧版）", note: "13 语种、括号情绪语法，仅用于兼容" },
]

export class FishAudioError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = "FishAudioError"
    this.status = status
    this.code = code
  }
}

export interface FishAudioConfig {
  apiKey: string
  baseUrl: string
  model: string
}

/**
 * @description 读取fishaudioconfig
 * @returns FishAudioConfig
 */
export function getFishAudioConfig(): FishAudioConfig {
  return {
    apiKey: env.FISH_AUDIO_API_KEY?.trim() || "",
    baseUrl: (env.FISH_AUDIO_BASE_URL?.trim() || FISH_AUDIO_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: env.FISH_AUDIO_MODEL?.trim() || FISH_AUDIO_DEFAULT_MODEL,
  }
}

/**
 * @description 判断fishaudioconfigured
 * @returns boolean
 */
export function isFishAudioConfigured(): boolean {
  return getFishAudioConfig().apiKey.length > 0
}

/**
 * @description 判断fishaudiomodeltier
 * @param model - 档位字符串
 * @returns boolean
 */
export function isKnownFishAudioModel(model: string): boolean {
  return FISH_AUDIO_MODEL_TIERS.some((tier) => tier.id === model)
}

function assertConfigured(config: FishAudioConfig) {
  if (!config.apiKey) {
    throw new FishAudioError("未配置 FISH_AUDIO_API_KEY，配音服务不可用", 503, "NOT_CONFIGURED")
  }
}

/** 只透出可行动信息，绝不打印密钥原文 */
function summarizeUpstreamFailure(status: number, body: string): string {
  if (status === 401 || status === 403) return "Fish Audio 密钥无效或无权访问，请检查 FISH_AUDIO_API_KEY"
  if (status === 429) return "Fish Audio 触发限流，请稍后重试"
  if (status === 402 || status === 406) return "Fish Audio 账户额度不足，请检查账户余额或改用免费档"
  const snippet = body.replace(/\s+/g, " ").slice(0, 160)
  return `Fish Audio 返回 ${status}${snippet ? `：${snippet}` : ""}`
}

/** 统一出站通道：配置了 FISH_AUDIO_PROXY_URL 时复用进程级 ProxyAgent，否则直连 */
function voiceFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  const proxyURL = resolveLlmProxyUrl(env.FISH_AUDIO_PROXY_URL)
  if (!proxyURL) return fetch(url, init)
  return fetch(url, { ...init, dispatcher: getSharedProxyAgent(proxyURL) } as RequestInit)
}

export interface SynthesizeSpeechInput {
  text: string
  /** 音色 id（Fish Audio 的 reference_id）；留空使用平台默认音色 */
  voiceId?: string | null
  /** 档位；留空用默认免费档 */
  model?: string | null
  format?: FishAudioFormat
  /** 语速 0.5–2.0 */
  speed?: number
  /** 音量增益 dB，-20–20 */
  volume?: number
}

export interface SynthesizeSpeechResult {
  audio: ArrayBuffer
  contentType: string
  model: string
  voiceId: string | null
  charCount: number
}

/**
 * @description 调用 Fish Audio 合成语音
 * @param input - 合成参数
 * @returns Promise<SynthesizeSpeechResult>
 */
export async function synthesizeSpeech(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
  const config = getFishAudioConfig()
  assertConfigured(config)

  const text = input.text.trim()
  if (!text) throw new FishAudioError("请先输入要配音的文案", 400, "EMPTY_TEXT")
  if (text.length > FISH_AUDIO_MAX_TEXT_LENGTH) {
    throw new FishAudioError(
      `单次配音最多 ${FISH_AUDIO_MAX_TEXT_LENGTH} 字，当前 ${text.length} 字，请分段后再试`,
      400,
      "TEXT_TOO_LONG",
    )
  }

  const format = input.format ?? "mp3"
  const model = input.model?.trim() || config.model
  const voiceId = input.voiceId?.trim() || null

  // 免费档实测约 12.5 字/秒：按文本量动态放宽超时，短文保底 60s、长文上限 240s
  const timeoutMs = Math.min(240_000, Math.max(DEFAULT_TIMEOUT_MS, 45_000 + text.length * 120))
  const response = await voiceFetch(`${config.baseUrl}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      model,
    },
    body: JSON.stringify({
      text,
      format,
      ...(voiceId ? { reference_id: voiceId } : {}),
      normalize: true,
      ...(input.speed || input.volume
        ? {
            prosody: {
              ...(input.speed ? { speed: clamp(input.speed, 0.5, 2) } : {}),
              ...(input.volume ? { volume: clamp(input.volume, -20, 20) } : {}),
            },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new FishAudioError(summarizeUpstreamFailure(response.status, detail), response.status, "UPSTREAM_FAILED")
  }

  return {
    audio: await response.arrayBuffer(),
    contentType: formatToContentType(format),
    model,
    voiceId,
    charCount: text.length,
  }
}

export interface FishVoiceModel {
  id: string
  title: string
  description?: string
  languages?: string[]
}

/**
 * @description 提交声音克隆：把一段授权录音训练成私有音色模型（训练异步，数分钟后可用）
 * @param input - 音色名与录音文件（10 秒以上安静环境朗读效果最佳）
 * @returns Promise<{ id: string }> Fish Audio 返回的音色模型 id
 */
export async function cloneVoiceModel(input: {
  title: string
  audio: Blob
  filename: string
  description?: string
}): Promise<{ id: string }> {
  const config = getFishAudioConfig()
  assertConfigured(config)

  const form = new FormData()
  form.set("title", input.title)
  form.set("type", "tts")
  form.set("visibility", "private")
  if (input.description) form.set("descriptions", input.description)
  form.append("voices", input.audio, input.filename)

  const response = await voiceFetch(`${config.baseUrl}/model`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new FishAudioError(summarizeUpstreamFailure(response.status, detail), response.status, "CLONE_FAILED")
  }
  const payload = (await response.json().catch(() => null)) as { _id?: string; id?: string } | null
  const id = String(payload?._id ?? payload?.id ?? "")
  if (!id) throw new FishAudioError("克隆请求已提交，但上游未返回音色 id", 502, "CLONE_NO_ID")
  return { id }
}

/**
 * @description 读取可用音色列表；上游不可用时返回空列表并标记 degraded
 * @param input - 查询参数
 * @returns Promise<{ items: FishVoiceModel[]; degraded: boolean; reason?: string }>
 */
export async function listVoiceModels(input: {
  selfOnly?: boolean
  pageSize?: number
  language?: string
} = {}): Promise<{ items: FishVoiceModel[]; degraded: boolean; reason?: string }> {
  const config = getFishAudioConfig()
  assertConfigured(config)

  const url = new URL(`${config.baseUrl}/model`)
  url.searchParams.set("page_size", String(clamp(input.pageSize ?? 20, 1, 50)))
  url.searchParams.set("page_number", "1")
  url.searchParams.set("sort_by", "task_count")
  if (input.selfOnly) url.searchParams.set("self", "true")
  if (input.language) url.searchParams.set("language", input.language)

  // 网络抖动（fetch failed）与上游错误码同等对待：降级返回空列表，绝不让路由 500
  let response: Response
  try {
    response = await voiceFetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error"
    return { items: [], degraded: true, reason: `音色列表网络异常：${reason}` }
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    return { items: [], degraded: true, reason: summarizeUpstreamFailure(response.status, detail) }
  }

  const payload = (await response.json().catch(() => null)) as {
    items?: Array<Record<string, unknown>>
  } | null
  const items = Array.isArray(payload?.items) ? payload.items : []
  return {
    items: items.map((item) => ({
      id: String(item._id ?? item.id ?? ""),
      title: String(item.title ?? item.nickname ?? "未命名音色"),
      description: typeof item.description === "string" ? item.description : undefined,
      languages: Array.isArray(item.languages) ? item.languages.map(String) : undefined,
    })).filter((item) => item.id.length > 0),
    degraded: false,
  }
}

/**
 * @description 转换format为响应contenttype
 * @param format - 音频格式
 * @returns string
 */
export function formatToContentType(format: FishAudioFormat): string {
  if (format === "wav") return "audio/wav"
  if (format === "pcm") return "audio/pcm"
  if (format === "opus") return "audio/ogg"
  return "audio/mpeg"
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

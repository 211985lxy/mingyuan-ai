"use client"

import { getApiErrorMessage } from "@/lib/api/core"

/** 单段配音文本上限，与服务端 FISH_AUDIO_MAX_TEXT_LENGTH 保持一致 */
export const VOICE_MAX_TEXT_LENGTH = 4000
/** 长文总上限：客户端分段（每段 1200 字）逐段合成后整体导入历史 */
export const VOICE_MAX_TOTAL_LENGTH = 12000

export interface VoiceModelTier {
  id: string
  label: string
  note: string
}

export interface VoiceModelOption {
  id: string
  title: string
  description?: string
  languages?: string[]
}

export interface VoiceModelsResponse {
  configured: boolean
  defaultModel: string
  tiers: VoiceModelTier[]
  voices: VoiceModelOption[]
  degraded: boolean
  reason?: string
}

export interface SynthesizeInput {
  text: string
  voiceId?: string | null
  model?: string | null
  format?: "mp3" | "wav" | "pcm" | "opus"
  speed?: number
  volume?: number
}

export interface SynthesizeOutput {
  blob: Blob
  objectUrl: string
  model: string
  charCount: number | null
}

export interface VoiceHistoryItem {
  id: string
  textPreview: string
  textContent: string | null
  audioUrl: string | null
  model: string
  voiceId: string | null
  format: string
  segments: number
  charCount: number
  createdAt: string
}

export interface VoiceHistoryPage {
  items: VoiceHistoryItem[]
  total: number
  page: number
  pageSize: number
}

/**
 * @description fetchvoicemodels
 * @param scope - all | mine
 * @param signal - 取消信号
 * @returns Promise<VoiceModelsResponse>
 */
export async function fetchVoiceModels(
  scope: "all" | "mine" = "all",
  signal?: AbortSignal,
): Promise<VoiceModelsResponse> {
  const response = await fetch(`/api/voice/models?scope=${scope}`, {
    credentials: "same-origin",
    signal: signal ?? null,
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || getApiErrorMessage(payload, response.status, response.statusText))
  }
  const payload = (await response.json()) as { data: VoiceModelsResponse }
  return payload.data
}

/**
 * @description synthesizevoiceaudio
 * @param input - 合成参数
 * @param signal - 取消信号
 * @returns Promise<SynthesizeOutput>
 */
export async function synthesizeVoiceAudio(
  input: SynthesizeInput,
  signal?: AbortSignal,
): Promise<SynthesizeOutput> {
  const response = await fetch("/api/voice/tts", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    signal: signal ?? null,
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || getApiErrorMessage(payload, response.status, response.statusText))
  }
  const blob = await response.blob()
  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    model: response.headers.get("X-Voice-Model") ?? "",
    charCount: Number(response.headers.get("X-Voice-Chars") ?? "") || null,
  }
}

/**
 * @description 导入客户端分段合成并拼接好的整段配音（转存 OSS + 落库）
 * @param input - 合成元数据与整段音频
 * @returns Promise<string | null> 历史记录 id
 */
export async function importVoiceHistory(input: {
  text: string
  model: string
  voiceId: string | null
  segments: number
  audio: Blob
}): Promise<string | null> {
  const form = new FormData()
  form.set("text", input.text)
  form.set("model", input.model)
  if (input.voiceId) form.set("voiceId", input.voiceId)
  form.set("segments", String(input.segments))
  form.set("audio", input.audio, "voice.mp3")

  const response = await fetch("/api/voice/history", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || getApiErrorMessage(payload, response.status, response.statusText))
  }
  const payload = (await response.json()) as { data: { recordId: string | null } }
  return payload.data.recordId
}

/**
 * @description fetchvoicehistory
 * @param page - 页码（1 起）
 * @param pageSize - 每页条数（≤50）
 * @returns Promise<VoiceHistoryPage>
 */
export async function fetchVoiceHistory(
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<VoiceHistoryPage> {
  const response = await fetch(`/api/voice/history?page=${page}&pageSize=${pageSize}`, {
    credentials: "same-origin",
    signal: signal ?? null,
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || getApiErrorMessage(payload, response.status, response.statusText))
  }
  const payload = (await response.json()) as { data: VoiceHistoryPage }
  return payload.data
}

/**
 * @description deletevoicehistory
 * @param id - 历史记录 id
 * @returns Promise<void>
 */
export async function deleteVoiceHistory(id: string): Promise<void> {
  const response = await fetch("/api/voice/history", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || getApiErrorMessage(payload, response.status, response.statusText))
  }
}

"use client"

import { getApiErrorMessage } from "@/lib/api/core"

/** 单次配音文本上限，与服务端 FISH_AUDIO_MAX_TEXT_LENGTH 保持一致 */
export const VOICE_MAX_TEXT_LENGTH = 4000

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

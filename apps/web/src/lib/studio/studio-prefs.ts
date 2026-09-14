"use client"

import { useEffect, useState } from "react"

/**
 * 数字人工坊的「默认即最优」偏好：上次用过的音色/形象/项目自动成为下次默认值。
 * localStorage 读写在挂载后进行，避免 SSR 水合不一致。
 */

export interface StudioAudioPrefs {
  voiceId: string
  tier: string
  speed: number
}

export interface StudioVideoPrefs {
  projectId: string
  avatarId: string
  aspectRatio: "9:16" | "16:9"
  fishVoiceId: string
}

const AUDIO_KEY = "studio-audio-prefs"
const VIDEO_KEY = "studio-video-prefs"

function readPrefs<T extends object>(key: string): Partial<T> {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<T>) : {}
  } catch {
    return {}
  }
}

function writePrefs(key: string, value: object) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式等场景下写入失败可接受：偏好只是默认值加速器 */
  }
}

export function loadAudioPrefs(): Partial<StudioAudioPrefs> {
  if (typeof window === "undefined") return {}
  return readPrefs<StudioAudioPrefs>(AUDIO_KEY)
}

export function saveAudioPrefs(prefs: StudioAudioPrefs) {
  writePrefs(AUDIO_KEY, prefs)
}

export function loadVideoPrefs(): Partial<StudioVideoPrefs> {
  if (typeof window === "undefined") return {}
  return readPrefs<StudioVideoPrefs>(VIDEO_KEY)
}

export function saveVideoPrefs(prefs: StudioVideoPrefs) {
  writePrefs(VIDEO_KEY, prefs)
}

/** 挂载后才读取本地偏好，返回 hydration 安全的标记。 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])
  return mounted
}

/**
 * 跨页脚本交接：AIM 交付物「去工坊出片」、音频「升级为视频」时携带文案。
 * 走 sessionStorage 而非 URL——2500 字中文脚本百分号编码后会超服务器 header 限制。
 */
export interface StudioVideoHandoff {
  script?: string
  projectId?: string
  aimGenerationId?: string
  voiceId?: string
}

const HANDOFF_KEY = "studio-video-handoff"

export function saveVideoHandoff(payload: StudioVideoHandoff) {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload))
  } catch {
    /* 交接失败可接受：用户仍可在工作台手动粘贴文案 */
  }
}

export function loadVideoHandoff(): StudioVideoHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY)
    return raw ? (JSON.parse(raw) as StudioVideoHandoff) : null
  } catch {
    return null
  }
}

export function clearVideoHandoff() {
  try {
    window.sessionStorage.removeItem(HANDOFF_KEY)
  } catch {
    /* noop */
  }
}

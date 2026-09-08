"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Pause, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { synthesizeVoiceAudio } from "@/lib/api/voice"
import { cn } from "@/lib/utils"

/** 试听固定文本：足够短（免费档约 2 秒合成），又能听出音色特点 */
const SAMPLE_TEXT = "你好，我是你的专属配音，很高兴为你朗读这段文字。"

interface VoiceSamplePreview {
  /** 当前正在合成试听音频的音色 id（含「平台默认音色」的空串） */
  loadingId: string | null
  /** 当前正在播放试听的音色 id */
  playingId: string | null
  /** 最近一次试听失败的音色 id */
  errorId: string | null
  toggle: (voiceId: string) => Promise<void>
}

/**
 * 音色试听控制器：按「音色×档位×语速」缓存试听音频（内存级），
 * 单一 <audio> 播放，切音色自动换源；卸载时停止并释放缓存。
 */
export function useVoiceSamplePreview(model: string | null, speed: number): VoiceSamplePreview {
  const cacheRef = useRef(new Map<string, string>())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      audioRef.current?.pause()
      for (const url of cacheRef.current.values()) URL.revokeObjectURL(url)
    },
    [],
  )

  const playCached = useCallback((voiceId: string, url: string) => {
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    if (audio.src !== url) audio.src = url
    audio.onended = () => setPlayingId(null)
    void audio.play().then(
      () => setPlayingId(voiceId),
      () => setErrorId(voiceId),
    )
  }, [])

  const toggle = useCallback(
    async (voiceId: string) => {
      if (playingId === voiceId) {
        audioRef.current?.pause()
        setPlayingId(null)
        return
      }
      const cacheKey = `${model ?? ""}|${speed}|${voiceId}`
      const cached = cacheRef.current.get(cacheKey)
      if (cached) {
        playCached(voiceId, cached)
        return
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoadingId(voiceId)
      setErrorId(null)
      try {
        const result = await synthesizeVoiceAudio(
          { text: SAMPLE_TEXT, voiceId: voiceId || null, model: model || null, speed },
          controller.signal,
        )
        cacheRef.current.set(cacheKey, result.objectUrl)
        setLoadingId(null)
        playCached(voiceId, result.objectUrl)
      } catch (caught) {
        setLoadingId(null)
        if (!(caught instanceof Error && caught.name === "AbortError")) setErrorId(voiceId)
      }
    },
    [model, playCached, playingId, speed],
  )

  return { errorId, loadingId, playingId, toggle }
}

/**
 * 音色选择列表：每行「名称（点选使用）+ ▶ 试听」，长列表滚动，
 * 替代原 Select 下拉以承载逐音色试听。
 */
export function VoicePickerList(props: {
  options: Array<{ id: string; title: string }>
  voiceId: string
  onVoicePick: (voiceId: string) => void
  preview: VoiceSamplePreview
  disabled?: boolean
}) {
  const rows = [{ id: "", title: "平台默认音色" }, ...props.options]
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="音色列表">
      {rows.map((voice) => {
        const selected = props.voiceId === voice.id
        const isLoading = props.preview.loadingId === voice.id
        const isPlaying = props.preview.playingId === voice.id
        return (
          <div
            key={voice.id || "default"}
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1.5 transition-colors",
              selected ? "border-primary/40 bg-primary/[0.06]" : "border-transparent hover:bg-foreground/[0.04]",
            )}
          >
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => props.onVoicePick(voice.id)}
              className="min-w-0 flex-1 truncate text-left text-sm text-foreground/85"
              title={voice.title}
            >
              {voice.title}
              {selected ? <span className="ml-1.5 rounded-sm bg-primary/15 px-1 text-[10px] text-primary">使用中</span> : null}
            </button>
            {props.preview.errorId === voice.id ? (
              <span className="text-[10px] text-destructive">试听失败</span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              disabled={props.disabled || isLoading}
              onClick={() => void props.preview.toggle(voice.id)}
              title={isPlaying ? "停止试听" : "试听该音色"}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
